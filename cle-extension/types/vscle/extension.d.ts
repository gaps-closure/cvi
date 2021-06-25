import { FilePath, NonEmpty, ZmqURI } from "./util";

/**
 * Extension settings
 */
export interface Settings {
    /**
     * A list of source directories to look for .c, .cpp .h and .hpp files in
     */
    sourceDirs: NonEmpty<FilePath[]>,

    /**
     * An optional zmq uri for the language server to connect to 
     */
    zmqURI?: ZmqURI
}

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