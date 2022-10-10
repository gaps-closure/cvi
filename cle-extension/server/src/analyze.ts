import { exec } from "child_process";
import { promisify } from "util";
import { Diagnostic, Position, Range } from "vscode-languageserver/node";
import { AnalyzerResult, NonEmpty, Settings, Topology } from "../../types/vscle/main";
import * as zmq from 'zeromq';
import { Context, ExtState } from "./server";
import { sendTopology } from "./util";
import { URI } from "vscode-uri";

export async function analyze(sock: zmq.Reply, settings: Settings, filenames: NonEmpty<string[]>)
	: Promise<NonEmpty<Diagnostic[]> | Topology> {
	const execAsync = promisify(exec);

	// Run conflict analyzer 
	const execProm = execAsync(settings.conflictAnalyzerCommand);
	const [msg] = await sock.receive();

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
			return diagnostics;
		case "Success":
			return res.topology;
		case "Error":
			throw new Error("Received error from conflict analyzer");
	}

}

export function sendResults(ctx: Context, state: ExtState, results: NonEmpty<Diagnostic[]> | Topology) {
	if(Array.isArray(results)) {
		for(const diagnostic of results) {
			const uri = diagnostic.source ? URI.file(diagnostic.source) : null;
			ctx.connection.sendDiagnostics({ uri: uri?.toString() ?? '', diagnostics: [diagnostic] });
		}
	} else {
		const { settings, curTextDoc } = state.get();
		
		ctx.connection.console.log(JSON.stringify(curTextDoc, null, 2));
		if(curTextDoc) {
			state.modify(s => ({...s, topology: results }));
			sendTopology(ctx.connection, results, settings, curTextDoc);
		} else {
			throw new Error("Current document could not be found.")
		}
	}
}
