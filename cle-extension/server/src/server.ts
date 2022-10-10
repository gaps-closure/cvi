import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	TextDocumentSyncKind,
	Connection,
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { Settings } from '../../types/vscle/extension';
import { NonEmpty } from '../../types/vscle/util';
import { getSrcFiles, readTopologyJSON, sendTopology } from './util';
import { makeDefinition } from './definition';
import { makeHover } from './hover';
import { makeRename } from './rename';
import { makeAction } from './action';
import { analyze, sendResults } from './analyze';
import * as zmq from 'zeromq';
import { Topology } from '../../types/vscle/analyzer';
import { makeLens } from './lens';

export interface Context {
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	sock: zmq.Reply
}

interface Ext {
	settings: Settings,
	curTextDoc?: TextDocument,
	topology?: Topology
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
			codeLensProvider: {
				resolveProvider: false
			}
		}
	}));

	documents.listen(connection);
	connection.listen();

	const sock = new zmq.Reply;

	return { connection, documents, sock };

}

function registerOnDidOpen(ctx: Context, { modify, get }: ExtState) {
	ctx.documents.onDidOpen(async ({ document }) => {
		let state = modify(s => ({ ...s, curTextDoc: document }));
	 	const topology = (await readTopologyJSON(ctx.connection, state.settings)) ?? get().topology;
		if(topology) {
			modify(s => ({...s, topology}))
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
			const results = await analyze(ctx.sock, settings, files as NonEmpty<string[]>);
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

function registerOnCodeLens(ctx: Context, state: ExtState) {
	ctx.connection.onCodeLens(params => makeLens(params, state));
}

function registerListeners(ctx: Context, state: ExtState) {
	registerOnDidOpen(ctx, state);
	registerOnConfigurationChange(ctx, state);
	registerOnExecuteCommand(ctx, state);
	registerOnHover(ctx, state);
	registerOnDefinition(ctx, state);
	registerOnCodeAction(ctx);
	registerOnRenameRequest(ctx, state);
	registerOnCodeLens(ctx, state);
}

async function initState({ connection, sock }: Context): Promise<ExtState> {
	await new Promise(resolve => connection.onInitialized(resolve));	
	const settings = await getSettings(connection); 
	await sock.bind(settings.zmqURI);
	let state : Ext = { settings };
	function put(newState: Ext): Ext {
		Object.assign(state, newState);
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

