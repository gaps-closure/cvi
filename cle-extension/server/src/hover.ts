import { readFile } from "fs/promises";
import { Connection, Hover, HoverParams } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import { Settings } from "../../types/vscle/main";
import { getAllCLikeFiles } from "./util";

export async function makeHover(connection: Connection, params: HoverParams, settings: Settings): Promise<Hover | null> {
	const line = params.position.line;
	const uri = URI.parse(params.textDocument.uri);
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	let buf;
	try {
		buf = await readFile(uri.fsPath);
	} catch (e) {
		connection.console.log(e);
		return null;
	}
	const src = buf.toString();
	const lines = src.split(/\n|\r\n/);
	const labelRegex = /(#pragma cle) (begin |end )?(\w+)/.exec(lines[line]);
	if (labelRegex) {
		const label = labelRegex[3];
		for (const file of files) {
			let buf;
			try {
				buf = await readFile(file);
			} catch (e) {
				connection.console.log(e);
				continue;
			}
			const src = buf.toString();
			const labelDefRegex = (new RegExp(`(#pragma cle def) ${label}(\\s+{(.*\\\\\\n)*.*})`, "g")).exec(src);
			if (labelDefRegex) {
				return {
					contents: {
						kind: "markdown",
						value: [
							"```c",
							labelDefRegex[0],
							"```"
						].join('\n')
					}
				};
			}
		}
	}
	return null;
}