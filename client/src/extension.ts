import { ExtensionContext, commands, window, env } from 'vscode';
import {
	Executable,
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
} from 'vscode-languageclient/node';
import * as path from 'path';

let client: LanguageClient;

// Called when extension is activated. See package.json "activationEvents"
export function activate(context: ExtensionContext) {

	// Run server executable
	let serverPath = context.asAbsolutePath(path.join('server', 'build', 'cle-lang-server'));
	let executable: Executable = {
		command: "sh",
		args: ["-c", serverPath]
	};

	// Extension logging output
	// let log = window.createOutputChannel("CLE Language Client");

	let serverOptions: ServerOptions = executable;

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
		window.showInformationMessage("Starting CLE Language Server");

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