import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	Position,
	Range,
	CodeLens,
	WorkspaceFolder,
	ExecuteCommandParams,
	ClientCapabilities
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import * as zmq from 'zeromq';
import { PathLike, readdir, readFile, stat } from 'fs';
import { URI } from 'vscode-uri';
import path = require('path');
import { promisify } from 'util';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const sock = new zmq.Request;

let workspaceFolder: WorkspaceFolder | null = null;
let topology: Topology | null = null;
let capabilities: ClientCapabilities | null = null;
let currentTextDocument: TextDocument | null = null;
interface EnclaveAssignment {
	name: string,
	level: string,
	line: string
}

interface Topology {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	source_path: string,
	levels: string[],
	// eslint-disable-next-line @typescript-eslint/naming-convention
	global_scoped_vars: EnclaveAssignment[],
	functions: EnclaveAssignment[]
};


connection.onInitialize((params: InitializeParams) => {
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			// codeLensProvider: {
			// 	resolveProvider: true
			// },
			executeCommandProvider: {
				commands: ['vscle.startConflictAnalyzer']
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
	sock.connect(process.env.ZMQ_URI || "tcp://localhost:5555");
	sock.sendTimeout = 500;
	// Try to find topology.json
	// topology = await readTopologyJSON();
});

documents.onDidOpen(params => {
	currentTextDocument = params.document;
});

async function readTopologyJSON(): Promise<Topology | null> {
	if (workspaceFolder !== null) {
		const uri = URI.parse(workspaceFolder.uri);
		let file;
		try {
			const asyncReadFile = promisify(readFile);
			file = await asyncReadFile(path.join(uri.fsPath, 'topology.json'));
		} catch (e) {
			connection.console.error(e);
			connection.console.log("Could not find topology.json");
			return null;
		}
		let topology: Topology = JSON.parse(file.toString());
		return topology;
	}
	return null;
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

// Temporarily disabled code lens
// connection.onCodeLens(({ textDocument }) => {
// 	if (topology) {
// 		const textPath = path.parse(path.resolve(URI.parse(textDocument.uri).fsPath));
// 		const topPath = path.parse(path.resolve(topology.source_path));

// 		// if (path.join(topPath.dir, topPath.base) !== topPath.dir) { return []; }
// 		connection.console.log(JSON.stringify(textPath));
// 		connection.console.log(JSON.stringify(topPath));
// 		const combined = [...topology.functions, ...topology.global_scoped_vars];
// 		return combined.map(({ level, line }) => {
// 			let lineNo = Math.max(parseInt(line) - 1, 0);
// 			return {
// 				range: Range.create(Position.create(lineNo, 0), Position.create(lineNo, 0)),
// 				command: {
// 					title: level,
// 					command: ""
// 				}
// 			};
// 		});
// 	}
// 	return [];
// });

connection.onExecuteCommand(async params => {
	if (params.command === 'vscle.startConflictAnalyzer' && workspaceFolder) {
		try {
			const files = await getAllCLikeFiles(URI.parse(workspaceFolder.uri).fsPath);
			if (files.length === 0) {
				throw new Error('Empty number of source files');
			}
			analyze(files as NonEmpty<string[]>);
		} catch (e) {
			connection.window.showErrorMessage(e.message);
			connection.console.error(e.message);
		}
	}
});


async function analyze(documents: NonEmpty<string[]>): Promise<void> {
	// send URI to zmq server and get response
	const start: Start = {
		action: 'Start',
		options: [],
		filenames: documents
	};

	let msg;
	try {
		await sock.send(JSON.stringify(start));
		[msg] = await sock.receive();
	} catch (e) {
		connection.console.error(e.message);
		connection.window.showErrorMessage("Could not receive data from conflict analyzer");
		return;
	}


	const res: AnalyzerResult = JSON.parse(msg.toString());

	switch (res.result) {
		case "Conflict":
			const diagnostics: Diagnostic[]
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
					});
			connection.sendDiagnostics({ uri: currentTextDocument?.uri ?? '', diagnostics });
			break;
		case 'Success':
			connection.window.showInformationMessage('Conflict Analysis successful!');
			break;
		case 'Error':
			// TODO: add message action to see logs
			connection.window.showErrorMessage('Conflict Analysis error');
			break;
	}
}

// Listen on the connection
documents.listen(connection);
connection.listen();
