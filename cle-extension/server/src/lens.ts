import { ParserInterpreter } from "antlr4ts";
import path = require("path");
import { CodeLens, CodeLensParams, Position, Range } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { FunctionDefinitionContext } from "./parsing/CParser";
import { functionDefinitions, functionName, parseCFile } from "./parsing/parser";
import { ExtState } from "./server";

export async function makeLens(params: CodeLensParams, state: ExtState) {
    const { topology, settings } = state.get();
    if(!topology) return [];
    const fullTextDocPath = path.resolve(URI.parse(params.textDocument.uri).fsPath);
    const assignments = topology.functions;
    const { tree } = await parseCFile(fullTextDocPath);
    const defs = functionDefinitions(tree);
    interface LevelDefPair {
        def: FunctionDefinitionContext,
        level: string
    }
    return assignments
        .map(({ name, level }) =>
            ({ def: defs.find(def => functionName(def).toString() === name.trim()), level }))
        .filter<LevelDefPair>((pair): pair is LevelDefPair => pair.def !== undefined)
        .map(({ def, level }) => {
            const startLine = def.start.line;
            const range = Range.create(Position.create(startLine - 1, 0), Position.create(startLine - 1, 0));
            console.log(JSON.stringify(range));
            return {
                range,
                command: {
                    title: level,
                    command: ''
                }
            }
        });
    
}


export function makeLens_(params: CodeLensParams, state: ExtState): CodeLens[] {
    const { topology } = state.get();
    if(!topology) return [];
    return [...topology.functions, ...topology.global_scoped_vars].map(fun => {
        const line = parseInt(fun.line);
        return {
            range: Range.create(Position.create(line, 0), Position.create(line, 0)),
            command: {
                title: fun.level,
                command: 'vscle.null'
            }
        }
    });
}