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
import { getSrcFiles, readTopologyJSON, sendTopology } from './util';
import { makeDefinition } from './definition';
import { makeHover } from './hover';
import { makeRename } from './rename';
import { makeAction } from './action';
import { analyze, sendResults } from './analyze';

export interface Context {
	connection: Connection,
	documents: TextDocuments<TextDocument>
}

interface Ext {
	settings: Settings,
	curTextDoc?: TextDocument
}
interface State<T> {
	get: () => T,
	modify: (modifier: (oldState: T) => T) => T,
	put: (newState: T) => T
}
export type ExtState = State<Ext>;

function initContext(): Context {

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

	documents.listen(connection);
	connection.listen();

	return { connection, documents };

}

function registerOnDidOpen(ctx: Context, { modify }: ExtState) {
	ctx.documents.onDidOpen(async ({ document }) => {
		let state = modify(s => ({ ...s, curTextDoc: document }));
	 	const topology = await readTopologyJSON(ctx.connection, state.settings);
		if(topology) {
			sendTopology(ctx.connection, topology, state.settings, state.curTextDoc!);
		}

	});
}
function wrapError<A,B>(connection: Connection, f: (x: A) => B) {
	return function(a: A): B | null {
		let res;
		try {
			res = f(a);
		} catch(e: any) {
			connection.console.error(e);
			connection.window.showErrorMessage(e.message);
			return null;
		}
		return res;
	}
}
function registerOnExecuteCommand(ctx: Context, state: ExtState) {
	ctx.connection.onExecuteCommand(wrapError(ctx.connection, async params => {
		if (params.command == 'vscle.startConflictAnalyzer') {
			const settings = state.get().settings;
			const files = await getSrcFiles(settings);
			if(files.length == 0) 
				throw new Error('Could not run conflict analyzer on empty source files');
			const results = await analyze(settings, files as NonEmpty<string[]>);
			sendResults(ctx, state, results);
		}
	}));
}

function registerOnConfigurationChange(ctx: Context, state: ExtState) {
	ctx.connection.onDidChangeConfiguration(async () => {
		const settings = await getSettings(ctx.connection);
		state.modify(s => ({...s, settings }));
	});
}

function registerOnHover(ctx: Context, state: ExtState) {
	ctx.connection.onHover(params => 
		makeHover(ctx.connection, params, state.get().settings)
	);
}

function registerOnDefinition(ctx: Context, state: ExtState) {
	ctx.connection.onDefinition(params => 
		makeDefinition(ctx.connection, params, state.get().settings)
	);
}

function registerOnCodeAction(ctx: Context) {
	ctx.connection.onCodeAction(makeAction);
}

function registerOnRenameRequest(ctx: Context, state: ExtState) {
	ctx.connection.onRenameRequest(params =>
		makeRename(ctx.connection, params, state.get().settings)
	);
}

function registerListeners(ctx: Context, state: ExtState) {
	registerOnDidOpen(ctx, state);
	registerOnConfigurationChange(ctx, state);
	registerOnExecuteCommand(ctx, state);
	registerOnHover(ctx, state);
	registerOnDefinition(ctx, state);
	registerOnCodeAction(ctx);
	registerOnRenameRequest(ctx, state);
}

async function initState({ connection }: Context): Promise<ExtState> {
	await new Promise(resolve => connection.onInitialized(resolve));	
	const settings = await getSettings(connection); 
	let state = { settings };
	function put(newState: Ext): Ext {
		state = newState;
		return state;
	}
	function get(): Ext {
		return state;
	}
	function modify(modifier: (oldState: Ext) => Ext): Ext {
		return put(modifier(get()));	
	}

	return { put, get, modify };
}

async function start() {
	const ctx = initContext();
	const state = await initState(ctx);
	registerListeners(ctx, state);
}


start();

async function getSettings(connection: Connection): Promise<Settings> {
	return (await connection.workspace.getConfiguration()).vscle as Settings;
}

