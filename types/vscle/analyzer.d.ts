type FilePath = string;
type NonEmpty<T> = T extends Array<infer U> ? U[] & { '0': U } : never;
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

interface FileSource {
    line: number,
    file: FilePath
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
     * The source file and line number the conflict originated from
     */
    source?: FileSource,

    /** 
     * A possible remedy to the conflict
    */
    remedy?: ConflictRemedy
}

/**
 * Sent from the conflict analyzer to the server
 * if there are no conflicts.
 */
interface Success {
    result: 'Success'
}

/**
 * TODO: elaborate type of error type
 */
type ErrorType = any;

interface Error {
    type: ErrorType,
    message: string
}

type AnalyzerResult
    = { result: 'Conflict', conflicts: NonEmpty<Conflict[]> }
    | { result: 'Error', errors: NonEmpty<Error[]> }
    | Success;