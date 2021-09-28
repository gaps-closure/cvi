import { Range } from "vscode-languageserver-types";
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
    zmqURI: ZmqURI,

    /**
     * Path to the conflict analyzer python script
     */
    conflictAnalyzerCommand: FilePath,
    /**
     * Output path for topology.json.
     */
    outputPath: FilePath,
}

export interface HighlightNotification {
    range: Range
    color: string
}
export interface UnHighlightNotification {}
