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
	Range
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import * as zmq from 'zeromq';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const sock = new zmq.Request;

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

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

connection.onInitialized(() => {
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
});

documents.onDidChangeContent(change => {
	if (hasDiagnosticRelatedInformationCapability) {
		validateTextDocument(change.document);
	}
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {

	// send URI to zmq server and get response
	// await sock.send(JSON.stringify({ documentURI: textDocument.uri }));
	// const [buffer] = await sock.receive();
	// const diag: Diagnostic = JSON.parse(buffer.toString());

	// Send the computed diagnostics to VSCode.
	// connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [diag] });
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [
		{
			range: Range.create(Position.create(42, 1), Position.create(42, 1)),
			message: "Conflict: Variable not assignable"
		}
	]});
}

// Listen on the connection
documents.listen(connection);
connection.listen();
