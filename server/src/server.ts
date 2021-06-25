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
	WorkspaceFolder,
	ClientCapabilities
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import * as zmq from 'zeromq';
import { readdir, readFile, stat } from 'fs';
import { URI } from 'vscode-uri';
import path = require('path');
import { promisify } from 'util';
import { Start, AnalyzerResult } from '../../types/vscle/analyzer';
import { Settings, Topology } from '../../types/vscle/extension';
import { NonEmpty } from '../../types/vscle/util';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const sock = new zmq.Request;

let workspaceFolder: WorkspaceFolder | null = null;
let capabilities: ClientCapabilities | null = null;
let currentTextDocument: TextDocument | null = null;
let settings: Settings = {
	sourceDirs: ['./annotated']
};

connection.onInitialize((params: InitializeParams) => {
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			executeCommandProvider: {
				commands: ['vscle.startConflictAnalyzer']
			},
			codeLensProvider: {
				resolveProvider: false
			},
			workspace: {
				workspaceFolders: {
					supported: true
				}
			}
		}
	};
	workspaceFolder = params.workspaceFolders ? params.workspaceFolders[0] : null;
	capabilities = params.capabilities;
	return result;
});

connection.onInitialized(async () => {
	// Register for all configuration changes.
	connection.client.register(DidChangeConfigurationNotification.type, undefined);

	// Connect to zero mq server and set timeout
	sock.connect(settings.zmqURI ?? process.env.ZMQ_URI ?? "tcp://localhost:5555");
	sock.sendTimeout = 500;

	// Sync settings
	settings = (await connection.workspace.getConfiguration()).vscle as Settings;
});

connection.onDidChangeConfiguration(async () => {
	settings = (await connection.workspace.getConfiguration()).vscle as Settings;
});
documents.onDidOpen(params => {
	currentTextDocument = params.document;
});

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


connection.onExecuteCommand(async params => {
	if (params.command === 'vscle.startConflictAnalyzer' && workspaceFolder) {
		try {
			// Get all c files from sourceDirs in settings
			const unflattened
				= await Promise.all(
					settings.sourceDirs.map(async dir =>
						await getAllCLikeFiles(dir)));
			const files = unflattened.flat();
			if (files.length === 0) {
				throw new Error('Empty number of source files');
			}
			// Give diagnostics back to user, otherwise show success message
			const diagnostics = await analyze(files as NonEmpty<string[]>);
			if (diagnostics) {
				connection.sendDiagnostics({ uri: currentTextDocument?.uri ?? '', diagnostics });
			} else {
				connection.window.showInformationMessage('Conflict Analysis successful');
			}
		} catch (e) {
			connection.window.showErrorMessage(e.message);
			connection.console.error(e.message);
		}
	}
});

async function readTopologyJSON() {
	const readFileAsync = promisify(readFile);
	const buf = await readFileAsync("./topology.json");
	return JSON.parse(buf.toString()) as Topology;
}

connection.onCodeLens(async params => {
	const fullTextDocPath = path.resolve(URI.parse(params.textDocument.uri).fsPath);
	const fullSourceDirPaths = settings.sourceDirs.map(p => path.resolve(p));
	const { dir: textDocDir } = path.parse(fullTextDocPath); 
	connection.console.log(textDocDir);
	connection.console.log(JSON.stringify(fullSourceDirPaths));
	const matchedSourceDir = fullSourceDirPaths.find(p => p === textDocDir);
	if (matchedSourceDir) {
		const top = await readTopologyJSON();
		const assignments = [...top.global_scoped_vars, ...top.functions];
		return assignments.map(a => {
			const line = parseInt(a.line);
			return {
				range: Range.create(Position.create(line, 0), Position.create(line, 0)),
				command: {
					title: a.level,
					command: ''
				}
			};
		});
	}
	return [];
});


async function analyze(filenames: NonEmpty<string[]>, options: string[] = [])
	: Promise<NonEmpty<Diagnostic[]> | null> {
	// Send URI to zmq server and get response
	const start: Start = {
		action: 'Start',
		options,
		filenames
	};
	let msg;
	try {
		await sock.send(JSON.stringify(start));
		[msg] = await sock.receive();
	} catch (e) {
		throw new Error("Could not receive data from conflict analyzer");
	}

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
							range: Range.create(
								Position.create(conflict.source.line, Number.MAX_VALUE),
								Position.create(conflict.source.line, Number.MAX_VALUE)),
							message: conflict.description
						};
					}) as NonEmpty<Diagnostic[]>;
			return diagnostics;
		case 'Success':
			return null;
		case 'Error':
			throw new Error("Received error from conflict analyzer");
	}
}

// Listen on the connection
documents.listen(connection);
connection.listen();
