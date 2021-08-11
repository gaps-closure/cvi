import { CodeAction, CodeActionParams } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import { functionDefinitions, parseCFile } from "./parsing/parser";

export async function makeAction(params: CodeActionParams): Promise<CodeAction[] | null> {
	const doc = URI.parse(params.textDocument.uri).fsPath;
	const parsed = await parseCFile(doc);
	const fndefs = functionDefinitions(parsed.tree);
	const { range } = params;
	const validSelection = 
		range.end.line == range.start.line 
			? range.end.character > range.start.character  
			: range.end.line > range.start.line;
	const sendAction = fndefs
		.map(fndef => fndef.start.line - 1)
		.filter(line => params.range.start.line == line)
		.length > 0 && validSelection; 
	if(sendAction) {
		return [{
			title: 'Wrap in CLE Label',
			kind: 'refactor.inline',
			command: {
				title: 'Wrap in CLE Label', 
				command: 'editor.action.insertSnippet',
				arguments: [{ 
					snippet: [
						"#pragma cle begin ${1:LABEL}", 
						"$TM_SELECTED_TEXT", 
						"#pragma cle end ${1:LABEL}", 
						""
					].join("\n")
				}]
			}
		}]
	} else {
		return null;
	}
}