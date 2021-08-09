import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	TextDocumentSyncKind,
	InitializeResult,
	Position,
	Range,
	NotificationType,
	DidChangeConfigurationParams,
	TextDocumentChangeEvent,
	ExecuteCommandParams,
	DefinitionParams,
	Definition,
	HoverParams,
	Hover,
	CodeActionParams,
	CodeAction,
	Command,
	RenameParams,
	WorkspaceEdit,
	TextEdit
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import * as zmq from 'zeromq';
import { readdir, readFile, stat } from 'fs';
import { URI } from 'vscode-uri';
import path = require('path');
import { promisify } from 'util';
import { HighlightNotification, Settings, UnHighlightNotification } from '../../types/vscle/extension';
import { AnalyzerResult, Topology } from '../../types/vscle/analyzer';
import { NonEmpty } from '../../types/vscle/util';
import { exec } from 'child_process';
import { URL } from 'url';
import { Either, left, right } from 'fp-ts/lib/Either';
import { functionDefinitions, functionName, parseCFile } from './parser';
import Color = require('color');
import {
	wrapListener,
	combine,
	map,
	cache,
	Stream,
	wrapListenerWithReturn,
	of,
	cloneable,
	clone,
	filter
} from './stream';
import { FunctionDefinitionContext } from './CParser';
import { CodeActionKind, Uri } from 'vscode';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			executeCommandProvider: {
				commands: ['vscle.startConflictAnalyzer', 'vscle.wrapInCLE']
			},
			hoverProvider: true,
			workspace: {
				workspaceFolders: {
					supported: true
				}
			},
			definitionProvider: true,
			codeActionProvider: true,
			renameProvider: true,
		}
	};
	return result;
});

connection.onInitialized(async () => {
	// Register for all configuration changes.
	connection.client.register(DidChangeConfigurationNotification.type, undefined);

	// Setup streams 
	const didOpen$ = cloneable(wrapListener(documents.onDidOpen));
	const configChange$ = wrapListener(connection.onDidChangeConfiguration);
	const settings$ = cloneable(settingsGen(configChange$));
	const topologyRead$ = readTopologyGen(clone(didOpen$), cache(clone(settings$)));
	const executeCommand$ = cloneable(wrapListener(connection.onExecuteCommand));
	const startConflictAnalyzer$ = filter(clone(executeCommand$), params => params.command == 'vscle.startConflictAnalyzer');
	const analysis$ = analyzerGen(startConflictAnalyzer$, cache(clone(settings$)));
	const topologyAnalysis$ = sendConflictsGen(analysis$);
	const topology$ = combine(topologyRead$, topologyAnalysis$);
	const textDoc$ = map(clone(didOpen$), params => params.document);
	sendTopologyIter(topology$, cache(clone(settings$)), cache(textDoc$));
	connection.onDefinition(async params => {
		const settings = (await cache(clone(settings$)).next()).value;
		return makeDefinition(params, settings);
	})
	connection.onHover(async params => {
		const settings = (await cache(clone(settings$)).next()).value;
		return makeHover(params, settings);
	})
	connection.onCodeAction(makeAction);
	connection.onRenameRequest(async params => 
		makeRename(params, (await cache(clone(settings$)).next()).value));
	
});
async function getSettings(): Promise<Settings> {
	return (await connection.workspace.getConfiguration()).vscle as Settings;
}
async function* settingsGen(configChange$: Stream<DidChangeConfigurationParams>): Stream<Settings> {
	yield await getSettings();
	while (true) {
		for await (const _ of configChange$) {
			yield await getSettings();
		}
	}
}
async function makeRename(params: RenameParams, settings: Settings): Promise<WorkspaceEdit | null> {
	const fsPath = URI.parse(params.textDocument.uri).fsPath;
	const def = await getCLEDefinition(fsPath, params.position.line, settings);
	if(!def) {
		return null;
	}
	const occurences = await getCLELabels(def.label, settings);
	console.log(JSON.stringify(occurences, null, 2));
	console.log(JSON.stringify(def, null, 2));
	if(!occurences) {
		return null;
	}

	function labelRange(info: CLEInfo): Range {
		const index = (new RegExp(info.label)).exec(info.text)!.index;
		const start = info.range.start.character + index;
		const end = start + info.label.length;
		return Range.create(
			Position.create(info.range.start.line, start), 
			Position.create(info.range.start.line, end)
		);
	}
	type Change = {
		[key: string]: TextEdit[]
	};
	const changesMap = new Map<string, TextEdit[]>();
	changesMap.set(
		URI.file(path.resolve(def.path)).toString(), [{ range: labelRange(def), newText: params.newName }]
	);

	for(const occ of occurences) {
		const key = URI.file(path.resolve(occ.path)).toString();
		const prev = changesMap.get(key) ?? [];
		changesMap.set(key, [{ range: labelRange(occ), newText: params.newName }, ...prev]);
	}

	let changes: Change = {};
	for (const [k,v] of changesMap.entries()) {
		changes[k] = v; 
	}
	return {
		changes
	};
}
async function makeAction(params: CodeActionParams): Promise<CodeAction[] | null> {
	const doc = URI.parse(params.textDocument.uri).fsPath;
	const parsed = await parseCFile(doc);
	const fndefs = functionDefinitions(parsed.tree);
	const { range } = params;
	const validSelection = 
		range.end.line == range.start.line 
			? range.end.character > range.start.character  
			: range.end.line > range.start.line;
	const sendAction = fndefs
		.map(fndef => fndef.start.line - 1)
		.filter(line => params.range.start.line == line)
		.length > 0 && validSelection; 
	if(sendAction) {
		return [{
			title: 'Wrap in CLE Label',
			kind: 'refactor.inline',
			command: {
				title: 'Wrap in CLE Label', 
				command: 'editor.action.insertSnippet',
				arguments: [{ 
					snippet: [
						"#pragma cle begin ${1:LABEL}", 
						"$TM_SELECTED_TEXT", 
						"#pragma cle end ${1:LABEL}", 
						""
					].join("\n")
				}]
			}
		}]
	} else {
		return null;
	}
}

async function* analyzerGen(startConflictAnalyzer$: Stream<ExecuteCommandParams>, settings$: Stream<Settings>):
	Stream<Either<NonEmpty<Diagnostic[]>, Topology>> {
	while (true) {
		for await (const params of startConflictAnalyzer$) {
			const settings = (await settings$.next()).value;
			try {
				const files
					= (await Promise.all(
						settings.sourceDirs.map(async dir =>
							await getAllCLikeFiles(dir)))).flat();
				if (files.length === 0) {
					throw new Error('Empty number of source files');
				}
				// Give diagnostics back to user, otherwise show success message
				yield await analyze(settings, files as NonEmpty<string[]>);
			} catch (e) {
				connection.window.showErrorMessage(e.message);
				connection.console.error(e.message);
			}
		}
	}
}

async function* sendConflictsGen(analysis$: Stream<Either<NonEmpty<Diagnostic[]>, Topology>>): Stream<Topology> {
	while (true) {
		for await (const res of analysis$) {
			switch (res._tag) {
				case "Left": {
					for (const diagnostic of res.left) {
						const uri = diagnostic.source ? URI.file(diagnostic.source) : null;
						connection.sendDiagnostics({ uri: uri?.toString() ?? '', diagnostics: [diagnostic] });
					}
					break;
				}
				default: {
					yield res.right;
				}
			}
		}
	}
}

async function* readTopologyGen(didOpen$: Stream<TextDocumentChangeEvent<TextDocument>>, settings$: Stream<Settings>): Stream<Topology> {
	while (true) {
		for await (const _ of didOpen$) {
			const settings = (await settings$.next()).value;
			const top = await readTopologyJSON(settings);
			if (top) {
				yield top;
			}
		}
	}
}

async function sendTopologyIter(top$: Stream<Topology>, settings$: Stream<Settings>, textDoc$: Stream<TextDocument>) {
	for await (const top of top$) {
		const settings = (await settings$.next()).value;
		const textDoc = (await textDoc$.next()).value;
		sendTopology(top, settings, textDoc);
	}
}

async function getAllCLikeFiles(pathOrURI: string): Promise<string[]> {
	const asnycReadDir = promisify(readdir);
	const files = await asnycReadDir(pathOrURI);
	const promises = files.map(async file => {
		const asyncStat = promisify(stat);
		const filePath = path.join(pathOrURI, file);
		const fileStat = await asyncStat(filePath);
		if (fileStat.isDirectory()) {
			try {
				return await getAllCLikeFiles(filePath);
			} catch (e) {
				// do nothing if can't read directory
			}
		} else if (fileStat.isFile()) {
			const { ext } = path.parse(filePath);
			if (ext === '.c' || ext === '.h' || ext === '.cpp' || ext === '.hpp') {
				return [filePath];
			}
		}
		return [];
	});
	const unflattened = await Promise.all(promises);
	return unflattened.flat();
}

async function readTopologyJSON(settings: Settings): Promise<Topology | null> {
	const readFileAsync = promisify(readFile);
	let top = null;
	try {
		const buf = await readFileAsync(path.join(settings.outputPath, "/topology.json"));
		top = JSON.parse(buf.toString()) as Topology;
	} catch (e) {
		connection.console.error(e);
	}
	return top;
}

async function sendTopology(top: Topology, settings: Settings, currentTextDocument: TextDocument) {
	const fullTextDocPath = path.resolve(URI.parse(currentTextDocument.uri).fsPath);
	const fullSourceDirPaths = settings.sourceDirs.map(p => path.resolve(p));
	const { dir: textDocDir } = path.parse(fullTextDocPath);
	const matchedSourceDir = fullSourceDirPaths.find(p => p === textDocDir);
	if (matchedSourceDir) {
		const assignments = top.functions;
		// const assignments = [...top.global_scoped_vars, ...top.functions];
		const { tree, tokenStream } = await parseCFile(fullTextDocPath);
		const defs = functionDefinitions(tree);
		const levelSet = new Set<string>();
		const levelMap = new Map<string, Color>();
		for (const { level } of assignments) {
			levelSet.add(level);
		}
		let i = 0;
		for (const level of levelSet) {
			levelMap.set(level, Color.hsl(i, 50, 65));
			i += 360 / levelSet.size;
		}
		interface LevelDefPair {
			def: FunctionDefinitionContext,
			level: string
		}
		connection.sendNotification<UnHighlightNotification>(new NotificationType<UnHighlightNotification>("unhighlight"), {});
		assignments
			.map(({ name, level }) =>
				({ def: defs.find(def => functionName(def).toString() === name.trim()), level }))
			.filter<LevelDefPair>((pair): pair is LevelDefPair => pair.def !== undefined)
			.forEach(({ def, level }) => {
				const startLine = def.start.line;
				const startChar = def.start.charPositionInLine;
				const endLine = def.stop?.line ?? startLine;
				const endChar = def.stop?.charPositionInLine ?? startChar;
				const range = Range.create(Position.create(startLine - 1, startChar), Position.create(endLine - 1, endChar));
				connection.sendNotification<HighlightNotification>(new NotificationType<HighlightNotification>("highlight"),
					{ range, color: `${levelMap.get(level)?.hex()}30` ?? '#0000' });
			});
	}
}

async function analyze(settings: Settings, filenames: NonEmpty<string[]>)
	: Promise<Either<NonEmpty<Diagnostic[]>, Topology>> {
	const execAsync = promisify(exec);

	// Run prebuild task
	if (settings.prebuild) {
		for (const fn of filenames) {
			await execAsync(settings.prebuild, {
				env: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					"SRC_FILE": fn,
					// eslint-disable-next-line @typescript-eslint/naming-convention
					"WORKING_DIR": settings.workingDir
				}
			});
		}
	}

	// Create ZMQ server
	const url = new URL(settings.zmqURI);
	const sock = new zmq.Reply;
	await sock.bind(settings.zmqURI);

	// Run conflict analyzer python file
	const execProm = execAsync(`${settings.pythonPath ?? 'python3'} ${settings.conflictAnalyzerPath} -z ${url.protocol}//localhost:${url.port} -f ${filenames[0]}`);

	// Receive ZMQ message
	const [msg] = await sock.receive();

	sock.close();
	// Wait for exit
	await execProm;

	// Parse result
	let res;
	try {
		res = JSON.parse(msg.toString()) as AnalyzerResult;
	} catch (e) {
		throw new Error("Could not parse result from conflict analyzer");
	}

	// Return diagnostics if applicable
	switch (res.result) {
		case "Conflict":
			const diagnostics
				= res.conflicts
					.flatMap(conflict =>
						conflict.sources.map(source => ({ source, ...conflict }))
					)
					.map(conflict => {
						if (!conflict.source) {
							return {
								range: Range.create(
									Position.create(0, 0),
									Position.create(0, 0)
								),
								message: conflict.description
							};
						}
						return {
							range: conflict.source.range,
							message: conflict.description,
							source: conflict.source.file
						};
					}) as NonEmpty<Diagnostic[]>;
			return left(diagnostics);
		case "Success":
			return right(res.topology);
		case "Error":
			throw new Error("Received error from conflict analyzer");
	}

}

async function makeDefinition(params: DefinitionParams, settings: Settings): Promise<Definition | null> {
	const line = params.position.line;
	const uri = URI.parse(params.textDocument.uri);
	const readFileAsync = promisify(readFile);
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	let buf;
	try {
		buf = await readFileAsync(uri.fsPath);
	} catch (e) {
		connection.console.log(e);
		return null;
	}
	const src = buf.toString();
	const lines = src.split(/\n|\r\n/);
	const labelRegex = /(#pragma cle) (begin |end )?(\w+)/.exec(lines[line]);
	if (labelRegex) {
		const label = labelRegex[3];
		for (const file of files) {
			let buf;
			try {
				buf = await readFileAsync(file);
			} catch (e) {
				connection.console.log(e);
				continue;
			}
			const src = buf.toString();
			const labelDefRegex = (new RegExp(`(#pragma cle def) ${label}(\\s+{(.*\\\\\\n)*.*})`, "g")).exec(src);
			if (labelDefRegex) {
				const index = labelDefRegex.index;
				let count = 0;
				let i = 0;
				let lastNewline = 0;
				for (; i < index; i++) {
					if (/^(\n|\r\n)/.exec(src.slice(i))) {
						count++;
						lastNewline = i;
					}
				}
				const charStart = index - lastNewline;
				return {
					uri: URI.parse(path.resolve(file)).toString(),
					range: Range.create(Position.create(count, charStart),
						Position.create(count, charStart + labelDefRegex[0].length))
				};
			}
		}
	}
	return null;
};

async function makeHover(params: HoverParams, settings: Settings): Promise<Hover | null> {
	const line = params.position.line;
	const uri = URI.parse(params.textDocument.uri);
	const readFileAsync = promisify(readFile);
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	let buf;
	try {
		buf = await readFileAsync(uri.fsPath);
	} catch (e) {
		connection.console.log(e);
		return null;
	}
	const src = buf.toString();
	const lines = src.split(/\n|\r\n/);
	const labelRegex = /(#pragma cle) (begin |end )?(\w+)/.exec(lines[line]);
	if (labelRegex) {
		const label = labelRegex[3];
		for (const file of files) {
			let buf;
			try {
				buf = await readFileAsync(file);
			} catch (e) {
				connection.console.log(e);
				continue;
			}
			const src = buf.toString();
			const labelDefRegex = (new RegExp(`(#pragma cle def) ${label}(\\s+{(.*\\\\\\n)*.*})`, "g")).exec(src);
			if (labelDefRegex) {
				return {
					contents: {
						kind: "markdown",
						value: [
							"```c",
							labelDefRegex[0],
							"```"
						].join('\n')
					}
				};
			}
		}
	}
	return null;
}

interface CLEInfo {
	range: Range,
	text: string,
	path: string,
	label: string,
};
async function getCLEDefinition(path: string, line: number, settings: Settings): Promise<CLEInfo | null> {
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	const readFileAsync = promisify(readFile);
	let buf;
	try {
		buf = await readFileAsync(path);
	} catch (e) {
		connection.console.log(e);
		return null;
	}
	const src = buf.toString();
	const lines = src.split(/\n|\r\n/);
	const labelRegex = /(#pragma cle) (begin |end )?(\w+)/.exec(lines[line]);
	if (labelRegex) {
		const label = labelRegex[3];
		for (const file of files) {
			let buf;
			try {
				buf = await readFileAsync(file);
			} catch (e) {
				connection.console.log(e);
				continue;
			}
			const src = buf.toString();
			const labelDefRegex = (new RegExp(`#pragma\\s+cle\\s+def\\s+${label}(\\s+{(.*\\\\\\s*\\n)*.*})`, "g")).exec(src);
			if(labelDefRegex) {
				const index = labelDefRegex.index;
				let count = 0;
				let i = 0;
				let lastNewline = 0;
				for (; i < index; i++) {
					if (/^(\n|\r\n)/.exec(src.slice(i))) {
						count++;
						lastNewline = i;
					}
				}
				const charStart = index - lastNewline - 1;
				return {
					range: Range.create(Position.create(count, charStart),
						Position.create(count, charStart + labelDefRegex[0].length)),
					path: file,
					text: labelDefRegex[0],
					label,
				};
			}
		}
	}
	return null;
}

async function getCLELabels(label: string, settings: Settings): Promise<CLEInfo[] | null> {
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	const readFileAsync = promisify(readFile);
	for(const file of files) {
		let buf;
		try {
			buf = await readFileAsync(file);
		} catch (e) {
			connection.console.log(e);
			continue;
		}
		const src = buf.toString();

		const lines = src.split(/\n|\r\n/);
		const labelRegexes = lines
			.map((line, i) => [/#pragma\s+cle\s+(begin|end)?\s+(\w+)/.exec(line), i])
			.filter(([regex, _]) => regex !== null) as [RegExpExecArray, number][];	
		return labelRegexes.map(([regex, line]) => {
			return {
				range: Range.create(
						Position.create(line, regex.index),
						Position.create(line, regex.input.length),
				),
				text: regex.input,
				label: regex[2],
				path: file
			};
		}).filter(({ label: foundLabel }) => label == foundLabel );
	}
	return null;
}

// Listen on the connection
documents.listen(connection);
connection.listen();
