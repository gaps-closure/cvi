import { exec } from "child_process";
import { Either, left, right } from "fp-ts/lib/Either";
import { URL } from "url";
import { promisify } from "util";
import { Diagnostic, Position, Range } from "vscode-languageserver/node";
import { AnalyzerResult, NonEmpty, Settings, Topology } from "../../types/vscle/main";
import * as zmq from 'zeromq';

export async function analyze(settings: Settings, filenames: NonEmpty<string[]>)
	: Promise<Either<NonEmpty<Diagnostic[]>, Topology>> {
	const execAsync = promisify(exec);

	// Run prebuild task
	if (settings.prebuild) {
		for (const fn of filenames) {
			await execAsync(settings.prebuild, {
				env: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					"SRC_FILE": fn,
					// eslint-disable-next-line @typescript-eslint/naming-convention
					"WORKING_DIR": settings.workingDir
				}
			});
		}
	}

	// Create ZMQ server
	const url = new URL(settings.zmqURI);
	const sock = new zmq.Reply;
	await sock.bind(settings.zmqURI);

	// Run conflict analyzer python file
	const execProm = execAsync(`${settings.pythonPath ?? 'python3'} ${settings.conflictAnalyzerPath} -z ${url.protocol}//localhost:${url.port} -f ${filenames[0]}`);

	// Receive ZMQ message
	const [msg] = await sock.receive();

	sock.close();
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
			return left(diagnostics);
		case "Success":
			return right(res.topology);
		case "Error":
			throw new Error("Received error from conflict analyzer");
	}

}