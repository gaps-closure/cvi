import { Range } from 'vscode-languageserver-types';
import { NonEmpty, FilePath } from './util';
/**
 * Parameters sent from the language server to the
 * conflict analyzer at its invocation.
 */
export interface EnclaveAssignment {
    name: string,
    level: string,
    line: string
}

/**
 * Topology.json 
 */
export interface Topology {
    source_path: FilePath
    levels: string[],
    global_scoped_vars: EnclaveAssignment[],
    functions: EnclaveAssignment[]
}

/**
 * Identifies conflicts by name
 * TODO: add more, perhaps turn into an enum
 */
export type ConflictIdentifier
    = 'Invalid JSON'
    | 'Undefined label'
    | 'Insufficient Enclaves'
    | 'Missing Enclaves'
    | 'Unresolvable Control Conflict'
    | 'Unresolvable Data Conflict';

/**
 * Possible conflict remedies 
 * TODO: convert to enum 
 */
export type ConflictRemedy = string;



export interface Source {
    file: FilePath
    range: Range,
}
/**
 * Sent from the conflict analyzer to the server
 * if it finds a conflict.
 */
export interface Conflict {
    /**
     * The name describing the conflict
     */
    name: ConflictIdentifier,

    /**
     * A description of the conflict sent
     */
    description: string,
    /**
     * An array of source file and line number the conflict originated from
     */
    sources: Source[],

    /** 
     * A list of possible remedies to the conflict
    */
    remedies: ConflictRemedy[]
}

/**
 * Sent from the conflict analyzer to the server
 * if there are no conflicts.
 */
export interface Success {
    result: 'Success'
}

/**
 * Error message with an errno and its associated message
 * and a custom error message
 */
export interface AnalyzerError {
    errno: number,
    errMessage: string,
    customMessage: string
}

export type AnalyzerResult
    = { result: 'Conflict', conflicts: NonEmpty<Conflict[]> }
    | { result: 'Error', errors: NonEmpty<AnalyzerError[]> }
    | { result: 'Success', topology: Topology };