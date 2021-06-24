import { ExtensionContext, commands, window, workspace } from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from 'vscode-languageclient/node';
import * as path from 'path';

let client: LanguageClient;

// Called when extension is activated. See package.json "activationEvents"
export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Client options contains a document selector for which files
	// get sent to the server on open/change
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'c' }, { scheme: 'file', language: 'cpp' }],
	};

	// Registers commands for server start/stop/restart. See package.json "commands"
	context.subscriptions.push(commands.registerCommand('vscle.startLanguageServer', () => {

		if (client) {
			window.showErrorMessage("CLE Language server already active");
		}
		// Create the language client and start the client.
		client = new LanguageClient(
			'cleLanguageServer',
			'CLE Language Server',
			serverOptions,
			clientOptions
		);

		// Start the client. This will also launch the server
		client.start();

	}));

	context.subscriptions.push(commands.registerCommand('vscle.stopLanguageServer', () => {

		// Stop client
		if (client) {
			client.stop();
		}

	}));

	context.subscriptions.push(commands.registerCommand('vscle.restartLanguageServer', async () => {
		await commands.executeCommand("vscle.stopLanguageServer");
		await commands.executeCommand("vscle.startLanguageServer");
	}));

	commands.executeCommand('vscle.startLanguageServer');
}

export function deactivate(): Thenable<void> | undefined {
	// Stop client
	if (!client) {
		return undefined;
	}
	return client.stop();
}