import argparse
import os
import zmq
import sys
import inflection
import json

from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple, Union
from dataclasses import dataclass, astuple, asdict


@dataclass
class EnclaveAssignment:
    name: str
    level: str
    line: str

@dataclass
class Topology:
    source_path: str
    levels: List[str]
    global_scoped_vars: List[EnclaveAssignment]
    functions: List[EnclaveAssignment]

@dataclass
class Source:
    file: str
    line: int
    character: Optional[int] = None

Remedy = str
ConflictIdentifier = str

@dataclass
class Conflict:
    name: ConflictIdentifier
    description: str
    sources: List[Source]
    remedies: List[Remedy]

@dataclass
class AnalyzerError:
    errno: int
    err_message: str
    custom_message: str


@dataclass
class ConflictResult:
    result: Literal["Conflict"] 
    conflicts: List[Conflict]

@dataclass
class ErrorResult:
    result: Literal["Error"]
    errors: List[AnalyzerError]  

@dataclass
class SuccessResult:
    result: Literal["Success"]
    topology: Topology

AnalyzerResult = Union[ConflictResult, ErrorResult, SuccessResult]
FileInfo = Tuple[Path, bytes]

@dataclass
class Args:
    cle_map_file: Path
    ll_file: Path
    output_dir: Path
    pdg_file: Path
    zmq_uri: Optional[str]

def conflict_analyzer(cle_map_file: FileInfo, ll_file: FileInfo, pdg_file: FileInfo) -> AnalyzerResult:
    conflict = Conflict(name="Unresolvable Data Conflict", 
                        description="Cannot assign variable to both levels PURPLE and ORANGE", 
                        sources=[Source("test/example1.c", 1)],
                        remedies=[])
    return ConflictResult(result="Conflict", conflicts=[conflict])


def get_args() -> Args:
    parser = argparse.ArgumentParser(description="CLOSURE Conflict analyzer")
    parser.add_argument("--cle-map-file", "-c", type=Path, required=False)
    parser.add_argument("--ll-file", "-l", type=Path, required=False)
    parser.add_argument("--pdg-file", "-p", type=Path, required=False)
    parser.add_argument("--output-dir", "-o", type=Path, required=True)
    parser.add_argument("--zmq-uri", "-z", nargs='?', type=str, required=False)
    parser.add_argument("--working-dir", "-w", type=Path, required=False)

    args = parser.parse_args()

    def validate_path(path: Optional[Path], name: str, dir: bool = False) -> Path:
        if(not path):
           print(f"Could not find {name} file", file=sys.stderr) 
           exit(1)

        exists = path.exists() 
        if(not exists):
           print(f"{name} file does not exist: {path}", file=sys.stderr) 
           exit(1)

        validtype = path.is_dir() == dir 
        if(not validtype):
           print(f"{path} is not a {'directory' if path.is_dir() else 'file'}", file=sys.stderr) 
           exit(1)

        return path 
    

    zmq_uri: Optional[str] = args.zmq_uri if 'zmq_uri' in args else None
    working_dir: Optional[Path] = args.working_dir if 'working_dir' in args else None
    output_dir: Path = args.output_dir
    cle_map_file: Optional[Path] = None
    ll_file: Optional[Path] = None
    pdg_file: Optional[Path] = None

    if working_dir:
        for file in os.listdir(working_dir):
            full_path = Path(working_dir) / file
            if file.endswith('.all.clemap.json'):
                cle_map_file = full_path 
                continue
            elif file.endswith('_all.ll'):
                ll_file = full_path 
                continue
            elif file.endswith('.main.dot'):
                pdg_file = full_path 
                continue
    else:
        cle_map_file = args.cle_map_file
        ll_file = args.ll_file
        pdg_file = args.pdg_file

    cle_map: Path = validate_path(cle_map_file, "CLE map JSON")
    ll: Path = validate_path(ll_file, "LLVM")
    pdg: Path = validate_path(pdg_file, "PDG dot")
    output: Path = validate_path(output_dir, "Output directory", True)

    return Args(cle_map, ll, output, pdg, zmq_uri)

        



def main() -> None:

    cle_map_file, ll_file, output_dir, pdg_file, zmq_uri = astuple(get_args())

    with open(cle_map_file, 'rb') as f:
        cle_map_src = f.read()
    with open(ll_file, 'rb') as f:
        ll_src = f.read() 
    with open(pdg_file, 'rb') as f:
        pdg_src = f.read()

    res = conflict_analyzer((cle_map_file, cle_map_src), (ll_file, ll_src), (pdg_file, pdg_src))

    def to_camel_case(items: List[Tuple[str, Any]]) -> Dict[str, Any]:
        return { inflection.camelize(k, False): v for (k, v) in items }

    if zmq_uri:
        context = zmq.Context()
        socket = context.socket(zmq.REQ)
        socket.connect(zmq_uri)
        socket.send_json(asdict(res, dict_factory=to_camel_case))
        print(f"Analyzer results sent to ZMQ URI {zmq_uri}", file=sys.stderr)
        socket.disconnect(zmq_uri)
 

    if isinstance(res, ConflictResult):
        def print_trace(conflict: Conflict) -> None:
            print(f"{conflict.name}: {conflict.description}", file=sys.stderr) 
            for source in conflict.sources:
                print(f"\tat {source.file}:{source.line}{':' + str(source.character) if source.character else ''}")

        for conflict in res.conflicts:
            print_trace(conflict)
    elif isinstance(res, ErrorResult):
        for error in res.errors:
            print(f"Error: {error.err_message} (ERRNO: {error.errno}). {error.custom_message}", file=sys.stderr)
    else:
        output_path = Path(output_dir) / 'topology.json'
        print(f"Success! Writing to {output_path}")
        with open(output_path) as top:
            top.write(json.dumps(asdict(res.topology, dict_factory=to_camel_case), indent=2))

if __name__ == '__main__':
    main()

 