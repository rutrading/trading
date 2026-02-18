"""Generate Python gRPC code from .proto definitions.

Generates protobuf and gRPC stubs into each service's generated/ directory.
Run from the project root: python scripts/gen_proto.py
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTO_DIR = ROOT / "proto"
SERVICES = ["market_data", "transformer", "filter", "scheduler"]


def generate(service: str) -> None:
    out_dir = ROOT / "services" / service / "generated"
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
        sys.executable,
        "-m",
        "grpc_tools.protoc",
        f"-I{PROTO_DIR}",
        f"--python_out={out_dir}",
        f"--pyi_out={out_dir}",
        f"--grpc_python_out={out_dir}",
        *[str(p) for p in proto_files],
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"protoc failed for {service}:\n{result.stderr}")
        sys.exit(1)

    # Fix imports in generated gRPC files to use relative imports
    for grpc_file in out_dir.glob("*_pb2_grpc.py"):
        content = grpc_file.read_text()
        for proto_file in proto_files:
            module_name = proto_file.stem + "_pb2"
            # Replace absolute import with relative import
            content = content.replace(
                f"import {module_name} as {module_name}",
                f"from . import {module_name} as {module_name}",
            )
        grpc_file.write_text(content)

    print(f"Generated gRPC code for {service} -> {out_dir}")


def main() -> None:
    for service in SERVICES:
        generate(service)
    print("Done.")


if __name__ == "__main__":
    main()
