
import { readFile } from 'fs';
import path = require('path');
import { promisify } from 'util';
import { Connection, Definition, DefinitionParams, Position, Range } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { Settings } from '../../types/vscle/main';
import { getAllCLikeFiles } from './util';

export async function makeDefinition(connection: Connection, params: DefinitionParams, settings: Settings): Promise<Definition | null> {
	const line = params.position.line;
	const uri = URI.parse(params.textDocument.uri);
	const readFileAsync = promisify(readFile);
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	let buf;
	try {
		buf = await readFileAsync(uri.fsPath);
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
				buf = await readFileAsync(file);
			} catch (e) {
				connection.console.log(e);
				continue;
			}
			const src = buf.toString();
			const labelDefRegex = (new RegExp(`(#pragma cle def) ${label}(\\s+{(.*\\\\\\n)*.*})`, "g")).exec(src);
			if (labelDefRegex) {
				const index = labelDefRegex.index;
				let count = 0;
				let i = 0;
				let lastNewline = 0;
				for (; i < index; i++) {
					if (/^(\n|\r\n)/.exec(src.slice(i))) {
						count++;
						lastNewline = i;
					}
				}
				const charStart = index - lastNewline;
				return {
					uri: URI.parse(path.resolve(file)).toString(),
					range: Range.create(Position.create(count, charStart),
						Position.create(count, charStart + labelDefRegex[0].length))
				};
			}
		}
	}
	return null;
};