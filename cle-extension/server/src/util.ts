import Color = require("color");
import { readdir, readFile, stat } from "fs/promises";
import * as path from "path";
import { Connection, NotificationType, Position, Range, TextDocument } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import { HighlightNotification, Settings, Topology, UnHighlightNotification } from "../../types/vscle/main";
import { FunctionDefinitionContext } from "./parsing/CParser";
import { functionDefinitions, functionName, parseCFile } from "./parsing/parser";

const labelRegex = /#pragma\s+cle\s+(begin|end)?\s+(\w+)/;
const labelDefRegex = /#pragma\s+cle\s+def\s+(\w+)(\s+{(.*\\\s*\n)*.*})/;

export interface CLEInfo {
	range: Range,
	text: string,
	path: string,
	label: string,
};

export async function getCLEDefinition(connection: Connection, path: string, line: number, settings: Settings): Promise<CLEInfo | null> {
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	const buf = await readFile(path);
	const src = buf.toString();
	const lines = src.split(/\n|\r\n/);
	const labelRegexRes = labelRegex.exec(lines[line]);
	if (labelRegexRes) {
		const label = labelRegexRes[2];
		for (const file of files) {
			let buf = await readFile(file);
			const src = buf.toString();
			const labelDefRegexRes = labelDefRegex.exec(src);
			if(labelDefRegexRes) {
				const index = labelDefRegexRes.index;
				let count = 0;
				let i = 0;
				let lastNewline = 0;
				for (; i < index; i++) {
					if (/^(\n|\r\n)/.exec(src.slice(i))) {
						count++;
						lastNewline = i;
					}
				}
				const charStart = index - lastNewline - 1;
				return {
					range: Range.create(Position.create(count, charStart),
						Position.create(count, charStart + labelDefRegexRes[0].length)),
					path: file,
					text: labelDefRegexRes[0],
					label,
				};
			}
		}
	}
	return null;
}

export async function getCLELabels(connection: Connection, label: string, settings: Settings): Promise<CLEInfo[] | null> {
	const files = (await Promise.all(settings.sourceDirs.map(path => getAllCLikeFiles(path)))).flat();
	for(const file of files) {
		let buf;
		try {
			buf = await readFile(file);
		} catch (e: any) {
			connection.console.log(e);
			continue;
		}
		const src = buf.toString();

		const lines = src.split(/\n|\r\n/);
		const labelRegexes = lines
			.map((line, i) => [/#pragma\s+cle\s+(begin|end)?\s+(\w+)/.exec(line), i])
			.filter(([regex, _]) => regex !== null) as [RegExpExecArray, number][];	
		return labelRegexes.map(([regex, line]) => {
			return {
				range: Range.create(
						Position.create(line, regex.index),
						Position.create(line, regex.input.length),
				),
				text: regex.input,
				label: regex[2],
				path: file
			};
		}).filter(({ label: foundLabel }) => label == foundLabel );
	}
	return null;
}

export async function getAllCLikeFiles(pathOrURI: string): Promise<string[]> {
	const files = await readdir(pathOrURI);
	const promises = files.map(async file => {
		const filePath = path.join(pathOrURI, file);
		const fileStat = await stat(filePath);
		if (fileStat.isDirectory()) {
			try {
				return await getAllCLikeFiles(filePath);
			} catch (e) {
				// do nothing if can't read directory
			}
		} else if (fileStat.isFile()) {
			const { ext } = path.parse(filePath);
			if (ext === '.c' || ext === '.h' || ext === '.cpp' || ext === '.hpp') {
				return [filePath];
			}
		}
		return [];
	});
	const unflattened = await Promise.all(promises);
	return unflattened.flat();
}

export async function sendTopology(connection: Connection, top: Topology, settings: Settings, currentTextDocument: TextDocument) {
	const fullTextDocPath = path.resolve(URI.parse(currentTextDocument.uri).fsPath);
	const fullSourceDirPaths = settings.sourceDirs.map(p => path.resolve(p));
	const { dir: textDocDir } = path.parse(fullTextDocPath);
	const matchedSourceDir = fullSourceDirPaths.find(p => p === textDocDir);
	if (matchedSourceDir) {
		const assignments = top.functions;
		// const assignments = [...top.global_scoped_vars, ...top.functions];
		const { tree, tokenStream } = await parseCFile(fullTextDocPath);
		const defs = functionDefinitions(tree);
		const levelSet = new Set<string>();
		const levelMap = new Map<string, Color>();
		for (const { level } of assignments) {
			levelSet.add(level);
		}
		let i = 0;
		for (const level of levelSet) {
			levelMap.set(level, Color.hsl(i, 50, 65));
			i += 360 / levelSet.size;
		}
		interface LevelDefPair {
			def: FunctionDefinitionContext,
			level: string
		}
		connection.sendNotification<UnHighlightNotification>(new NotificationType<UnHighlightNotification>("unhighlight"), {});
		assignments
			.map(({ name, level }) =>
				({ def: defs.find(def => functionName(def).toString() === name.trim()), level }))
			.filter<LevelDefPair>((pair): pair is LevelDefPair => pair.def !== undefined)
			.forEach(({ def, level }) => {
				const startLine = def.start.line;
				const startChar = def.start.charPositionInLine;
				const endLine = def.stop?.line ?? startLine;
				const endChar = def.stop?.charPositionInLine ?? startChar;
				const range = Range.create(Position.create(startLine - 2, startChar), Position.create(endLine, endChar));
				connection.sendNotification<HighlightNotification>(new NotificationType<HighlightNotification>("highlight"),
					{ range, color: `${levelMap.get(level)?.hex()}30` ?? '#0000' });
			});
	}
}

export async function readTopologyJSON(connection: Connection, settings: Settings): Promise<Topology | null> {
	let top = null;
	try {
		const buf = await readFile(path.join(settings.outputPath, "/topology.json"));
		top = JSON.parse(buf.toString()) as Topology;
	} catch (e: any) {
		connection.console.error(e);
	}
	return top;
}

