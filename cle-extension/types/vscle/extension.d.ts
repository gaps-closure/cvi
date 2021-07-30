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
    conflictAnalyzerPath: FilePath,

    /**
     * Prebuild command which runs once per source file. 
     * Environment variable $SRC_FILE will be set to the file path
     * Environment variable $WORKING_DIR will be set to the working directory path 
     */
    prebuild?: string,

    /**
     * Path to the python executable. Defaults to using python3
     */
    pythonPath?: FilePath,

    /**
     * Directory to store work in. Defaults to '.cle-work/'
     */
    workingDir: FilePath,

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
