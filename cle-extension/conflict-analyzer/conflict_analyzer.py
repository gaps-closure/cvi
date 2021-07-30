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
class Position:
    line: int
    character: int

@dataclass
class Range:
    start: Position
    end: Position

@dataclass
class Source:
    file: str
    range: Range


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
    topology: Optional[Topology]


AnalyzerResult = Union[ConflictResult, ErrorResult, SuccessResult]
FileInfo = Tuple[Path, bytes]


@dataclass
class Args:
    src_files: List[Path]
    output_dir: Path
    zmq_uri: Optional[str]


return_conflict = False


def conflict_analyzer(src_files: List[Path]) -> AnalyzerResult:
    src_file = src_files[0]
    name = src_file.parts[-1]
    conflict = Conflict(name="Invalid JSON",
                        description="Label 'ORANGE' has incorrect JSON. rettaints is provided but argtaints and codtaints are missing.\nSuggested refactor:\n\tAdd argtaints and codtaints to 'ORANGE'",
                        sources=[
                            Source("/home/closure/gaps/build/apps/conflicts/annotated/missing-taints-def.c", Range(Position(3, 1), Position(10, 4)))],
                        remedies=[])
    if return_conflict:
        return ConflictResult(result="Conflict", conflicts=[conflict])
    topology = Topology(
        "./refactored",
        [
            "purple",
            "orange"
        ],
        [],
        [
            EnclaveAssignment(
                "calc_ewma",
                "purple",
                "11"
            ),
            EnclaveAssignment(
                "get_a",
                "orange",
                "18"
            ),
            EnclaveAssignment(
                "get_b",
                "purple",
                "26"
            ),
            EnclaveAssignment(
                "ewma_main",
                "purple",
                "34"
            ),
            EnclaveAssignment(
                "main",
                "purple",
                "49"
            )
        ]
    )
    return SuccessResult("Success", topology)


def get_args() -> Args:
    parser = argparse.ArgumentParser(description="CLOSURE Conflict analyzer")
    parser.add_argument("--files", "-f",  type=Path, required=False)
    parser.add_argument("--zmq-uri", "-z", nargs='?', type=str, required=False)
    parser.add_argument("--output-dir", "-o", nargs='?',
                        type=Path, required=False)

    args = parser.parse_args()

    src_files: List[Path] = [args.files]
    zmq_uri: Optional[str] = args.zmq_uri if 'zmq_uri' in args else None
    output_dir: Path = args.output_dir if 'output_dir' in args and args.output_dir is not None else Path(
        '.')

    return Args(src_files, output_dir, zmq_uri)


def main() -> None:

    args = get_args()
    src_files = args.src_files
    output_dir = args.output_dir
    zmq_uri = args.zmq_uri

    res = conflict_analyzer(src_files)

    def to_camel_case(items: List[Tuple[str, Any]]) -> Dict[str, Any]:
        return {inflection.camelize(k, False): v for (k, v) in items}

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
                print(
                    f"\tat {source.file}:{source.range.start.line}")

        for conflict in res.conflicts:
            print_trace(conflict)
    elif isinstance(res, ErrorResult):
        for error in res.errors:
            print(
                f"Error: {error.err_message} (ERRNO: {error.errno}). {error.custom_message}", file=sys.stderr)
    else:
        if res.topology:
            output_path = output_dir / 'topology.json'
            print(f"Success! Writing to {output_path}")
            with open(output_path, 'w') as top:
                top.write(json.dumps(
                    asdict(res.topology), indent=2))
        else:
            print("Conflict analyzer success!")


if __name__ == '__main__':
    main()
