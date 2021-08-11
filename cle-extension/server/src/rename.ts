import * as path from "path";
import { Connection, Position, Range, RenameParams, TextEdit, WorkspaceEdit } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import { Settings } from "../../types/vscle/main";
import { CLEInfo, getCLEDefinition, getCLELabels } from "./util";

export async function makeRename(connection: Connection, params: RenameParams, settings: Settings): Promise<WorkspaceEdit | null> {
	const fsPath = URI.parse(params.textDocument.uri).fsPath;
	const def = await getCLEDefinition(connection, fsPath, params.position.line, settings);
	if(!def) {
		return null;
	}
	const occurences = await getCLELabels(connection, def.label, settings);
	console.log(JSON.stringify(occurences, null, 2));
	console.log(JSON.stringify(def, null, 2));
	if(!occurences) {
		return null;
	}

	function labelRange(info: CLEInfo): Range {
		const index = (new RegExp(info.label)).exec(info.text)!.index;
		const start = info.range.start.character + index;
		const end = start + info.label.length;
		return Range.create(
			Position.create(info.range.start.line, start), 
			Position.create(info.range.start.line, end)
		);
	}
	type Change = {
		[key: string]: TextEdit[]
	};
	const changesMap = new Map<string, TextEdit[]>();
	changesMap.set(
		URI.file(path.resolve(def.path)).toString(), [{ range: labelRange(def), newText: params.newName }]
	);

	for(const occ of occurences) {
		const key = URI.file(path.resolve(occ.path)).toString();
		const prev = changesMap.get(key) ?? [];
		changesMap.set(key, [{ range: labelRange(occ), newText: params.newName }, ...prev]);
	}

	let changes: Change = {};
	for (const [k,v] of changesMap.entries()) {
		changes[k] = v; 
	}
	return {
		changes
	};
}