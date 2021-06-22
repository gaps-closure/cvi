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
	WorkspaceFolder
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import * as zmq from 'zeromq';
import { PathLike, readFile } from 'fs';
import { URI } from 'vscode-uri';
import path = require('path');

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const sock = new zmq.Request;

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let workspaceFolder: WorkspaceFolder | null = null;
let topology: Topology | null = null;

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
	const capabilities = params.capabilities;

	workspaceFolder = params.workspaceFolders ? params.workspaceFolders[0] : null;
	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);


	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			codeLensProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(async () => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
	// Connect to zero mq server
	sock.connect(process.env.URI || "tcp://localhost:5555");

	// Try to find topology.json
	topology = await readTopologyJSON();

	connection.console.log(JSON.stringify(topology));
});

function asyncReadFile(path: number | PathLike): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		readFile(path, null, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}

async function readTopologyJSON(): Promise<Topology | null> {
	if (workspaceFolder !== null) {
		const uri = URI.parse(workspaceFolder.uri);
		let file;
		try {
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

connection.onCodeLens(({ textDocument }) => {
	if (topology) {
		const textPath = path.parse(path.resolve(URI.parse(textDocument.uri).fsPath));
		const topPath = path.parse(path.resolve(topology.source_path));

		// if (path.join(topPath.dir, topPath.base) !== topPath.dir) { return []; }
		connection.console.log(JSON.stringify(textPath));
		connection.console.log(JSON.stringify(topPath));
		const combined = [...topology.functions, ...topology.global_scoped_vars];
		return combined.map(({ level, line }) => {
			let lineNo = Math.max(parseInt(line) - 1, 0);
			return {
				range: Range.create(Position.create(lineNo, 0), Position.create(lineNo, 0)),
				command: {
					title: level,
					command: ""
				}
			};
		});
	}
	return [];
});

documents.onDidChangeContent(change => {
	if (hasDiagnosticRelatedInformationCapability) {
		validateTextDocument(change.document);
	}
	connection.console.log(documents.all().map(doc => doc.uri).toString());
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// send URI to zmq server and get response
	// await sock.send(JSON.stringify({ documentURI: textDocument.uri }));
	// const [buffer] = await sock.receive();
	// const diag: Diagnostic = JSON.parse(buffer.toString());

	// Send the computed diagnostics to VSCode.
	// connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [diag] });
	// connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [
	// 	{
	// 		range: Range.create(Position.create(42, 1), Position.create(42, 1)),
	// 		message: "Conflict: Variable not assignable"
	// 	}
	// ]});
}

// Listen on the connection
documents.listen(connection);
connection.listen();
