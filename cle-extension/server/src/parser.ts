import { readFile } from "fs";
import { promisify } from "util";
import { CListener } from './CListener'
import { CompilationUnitContext, CParser, DeclarationContext, DirectDeclaratorContext, FunctionDefinitionContext } from './CParser'
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker'
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { CLexer } from "./CLexer";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";

export async function parseCFile(filename: string): Promise<{ tree: CompilationUnitContext, tokenStream: CommonTokenStream}> {

    const asyncRead = promisify(readFile);
    const src = (await asyncRead(filename)).toString();

    let inputStream = CharStreams.fromString(src);
    let lexer = new CLexer(inputStream);
    let tokenStream = new CommonTokenStream(lexer);
    let parser = new CParser(tokenStream);

    let tree = parser.compilationUnit();

    return { tree, tokenStream };
}

export function functionDefinitions(tree: CompilationUnitContext): FunctionDefinitionContext[] {
    const functions: FunctionDefinitionContext[] = [];

    class EnterFunctionListener implements CListener {
        enterFunctionDefinition(context: FunctionDefinitionContext) {
            functions.push(context);
        }
    }
    const listener: CListener = new EnterFunctionListener();
    ParseTreeWalker.DEFAULT.walk(listener, tree);

    return functions;    
}

export function declarations(tree: CompilationUnitContext): DeclarationContext[] {

    const decls: DeclarationContext[] = [];

    class EnterDeclarationListener implements CListener {
        enterDeclaration(context: DeclarationContext) {
            decls.push(context);
        }
    }
    const listener: CListener = new EnterDeclarationListener();
    ParseTreeWalker.DEFAULT.walk(listener, tree);

    return decls;    
}

export function functionName(def: FunctionDefinitionContext): TerminalNode {
    const dd = def.declarator().directDeclarator();
    function go(dd: DirectDeclaratorContext): TerminalNode {
        const ddChild = dd.directDeclarator();
        const id = dd.Identifier();
        const dec = dd.declarator();
        if(id) {
            return id;
        } else if(ddChild) {
            return go(ddChild);
        } else {
            // SAFETY: See C.g4 directDeclarator definition
            return go(dec!.directDeclarator());
        }
    } 
    return go(dd);
}