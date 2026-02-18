"""Generate Python gRPC code from .proto definitions.

Generates protobuf and gRPC stubs into each target's generated/ directory.
Runs protoc via `uv run` inside each target so grpcio-tools is available.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTO_DIR = ROOT / "proto"

# All directories that need generated proto code
TARGETS = [
    ROOT / "services" / "market_data",
    ROOT / "services" / "transformer",
    ROOT / "services" / "filter",
    ROOT / "services" / "scheduler",
    ROOT / "api",
]


def generate(target_dir: Path) -> None:
    name = target_dir.name
    out_dir = target_dir / "generated"
    out_dir.mkdir(exist_ok=True)

    # Write __init__.py so the generated dir is a package
    init_file = out_dir / "__init__.py"
    if not init_file.exists():
        init_file.write_text("")

    proto_files = list(PROTO_DIR.glob("*.proto"))
    if not proto_files:
        print(f"No .proto files found in {PROTO_DIR}")
        sys.exit(1)

    cmd = [
        "uv",
        "run",
        "python",
        "-m",
        "grpc_tools.protoc",
        f"-I{PROTO_DIR}",
        f"--python_out={out_dir}",
        f"--pyi_out={out_dir}",
        f"--grpc_python_out={out_dir}",
        *[str(p) for p in proto_files],
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=target_dir)
    if result.returncode != 0:
        error = result.stderr or result.stdout
        print(f"protoc failed for {name}:\n{error}")
        sys.exit(1)

    # Fix imports in all generated files to use relative imports
    for gen_file in list(out_dir.glob("*_pb2.py")) + list(
        out_dir.glob("*_pb2_grpc.py")
    ):
        content = gen_file.read_text()
        for proto_file in proto_files:
            module_name = proto_file.stem + "_pb2"
            content = content.replace(
                f"import {module_name} as ",
                f"from . import {module_name} as ",
            )
        gen_file.write_text(content)

    print(f"Generated gRPC code for {name} -> {out_dir}")


def main() -> None:
    for target in TARGETS:
        generate(target)
    print("Done.")


if __name__ == "__main__":
    main()
