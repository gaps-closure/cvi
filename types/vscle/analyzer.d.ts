type FilePath = string;
type NonEmpty<T> = T extends Array<infer U> ? U[] & { 0: U } : never;
/**
 * Parameters sent from the language server to the
 * conflict analyzer at its invocation.
 */
interface Start {
    action: 'Start',
    /**
     * A list of string arguments, i.e. for logging
     */
    options: string[],
    /**
     * A list of filenames in the workspace
     */
    filenames: NonEmpty<FilePath[]>,
}

/**
 * Identifies conflicts by name
 * TODO: add more, perhaps turn into an enum
 */
type ConflictIdentifier
    = 'Insufficient Enclaves'
    | 'Missing Enclaves'
    | 'Unresolvable Control Conflict'
    | 'Unresolvable Data Conflict';

/**
 * Possible conflict remedies 
 * TODO: convert to enum 
 */
type ConflictRemedy = string;

interface Source {
    file: FilePath
    line: number,
    character?: number
}
/**
 * Sent from the conflict analyzer to the server
 * if it finds a conflict.
 */
interface Conflict {
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
interface Success {
    result: 'Success'
}

/**
 * Error message with an errno and its associated message
 * and a custom error message
 */
interface AnalyzerError {
    errno: number,
    errMessage: string,
    customMessage: string
}

type AnalyzerResult
    = { result: 'Conflict', conflicts: NonEmpty<Conflict[]> }
    | { result: 'Error', errors: NonEmpty<AnalyzerError[]> }
    | Success;