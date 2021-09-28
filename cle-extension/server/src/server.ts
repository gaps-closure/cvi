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
	Connection,
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
import { functionDefinitions, functionName, parseCFile } from './parsing/parser';
import * as Color from 'color';
import {
	cloneable,
	wrapListener,
	filter,
	clone,
	Stream,
	combine,
	map,
	cache
} from './stream';

import { FunctionDefinitionContext } from './parsing/CParser';
import { getAllCLikeFiles, readTopologyJSON, sendTopology } from './util';
import { makeDefinition } from './definition';
import { makeHover } from './hover';
import { makeRename } from './rename';
import { makeAction } from './action';
import { analyze } from './analyze';


const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams) => ({
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
}));

connection.onInitialized(async () => {
	// Register for all configuration changes.
	connection.client.register(DidChangeConfigurationNotification.type, undefined);

	// Setup streams 
	let topology : Topology | null = null;
	let currentTextDocument : TextDocument | null = null;
	documents.onDidOpen(async params => {
		const settings = await getSettings(); 
		currentTextDocument = params.document;
		if(!topology) {
			const top = await readTopologyJSON(connection, settings);
			if(top) {
				topology = top;
				sendTopology(connection, topology, settings, currentTextDocument);
			}

		}
	})
	connection.onExecuteCommand(async params => {
		if(params.command == 'vscle.startConflictAnalyzer') {
			const settings = await getSettings();
			try {
				const files
					= (await Promise.all(
						settings.sourceDirs.map(async dir =>
							await getAllCLikeFiles(dir)))).flat();
				if (files.length === 0) {
					throw new Error('Empty number of source files');
				}
				// Give diagnostics back to user, otherwise show topology
				const res = await analyze(settings, files as NonEmpty<string[]>);
				switch (res._tag) {
					case "Left": {
						for (const diagnostic of res.left) {
							const uri = diagnostic.source ? URI.file(diagnostic.source) : null;
							connection.sendDiagnostics({ uri: uri?.toString() ?? '', diagnostics: [diagnostic] });
						}
						break;
					}
					default: {
						topology = res.right;
						if(currentTextDocument)
							sendTopology(connection, topology, settings, currentTextDocument);
					}
				}
			} catch (e: any) {
				connection.window.showErrorMessage(e.message);
				connection.console.error(e.message);
			}
		}
	});

	connection.onHover(async params => 
		makeHover(connection, params, await getSettings())
	);
	connection.onDefinition(async params => 
		makeDefinition(connection, params, await getSettings())
	);
	connection.onCodeAction(makeAction);
	connection.onRenameRequest(async params => 
		makeRename(connection, params, await getSettings())
	);
	
	
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

async function* analyzerGen(startConflictAnalyzer$: Stream<ExecuteCommandParams>, settings$: Stream<Settings>):
	Stream<Either<NonEmpty<Diagnostic[]>, Topology>> {
	while (true) {
		for await (const _params of startConflictAnalyzer$) {
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
			} catch (e: any) {
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

// Listen on the connection
documents.listen(connection);
connection.listen();
