"""Generate Python gRPC code from .proto definitions.

Generates protobuf and gRPC stubs into each target's generated/ directory.
Runs protoc via `uv run` inside each target so grpcio-tools is available.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTO_DIR = ROOT / "proto"
PROTO_PACKAGE_DIR = PROTO_DIR / "trading"

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

    # Clean old generated files (keep the directory itself)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(exist_ok=True)

    # Write __init__.py so the generated dir is a package
    (out_dir / "__init__.py").write_text("")

    proto_files = list(PROTO_PACKAGE_DIR.glob("*.proto"))
    if not proto_files:
        print(f"No .proto files found in {PROTO_PACKAGE_DIR}")
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

    # protoc puts files in generated/trading/ because of the package path.
    # Move them up to generated/ so imports stay simple (from generated import ...).
    pkg_dir = out_dir / "trading"
    if pkg_dir.exists():
        for f in pkg_dir.iterdir():
            dest = out_dir / f.name
            if dest.exists():
                dest.unlink()
            f.rename(dest)
        pkg_dir.rmdir()

    # Fix imports in all generated files to use relative imports.
    # protoc generates "from trading import X_pb2 as ..." because protos
    # are in the trading/ package dir. We rewrite to "from . import X_pb2 as ...".
    for gen_file in list(out_dir.glob("*_pb2.py")) + list(
        out_dir.glob("*_pb2_grpc.py")
    ):
        content = gen_file.read_text()
        for proto_file in proto_files:
            module_name = proto_file.stem + "_pb2"
            content = content.replace(
                f"from trading import {module_name}",
                f"from . import {module_name}",
            )
        gen_file.write_text(content)

    print(f"Generated gRPC code for {name} -> {out_dir}")


def main() -> None:
    for target in TARGETS:
        generate(target)
    print("Done.")


if __name__ == "__main__":
    main()
