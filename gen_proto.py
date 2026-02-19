"""Generate Python gRPC code from .proto definitions."""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROTO_DIR = ROOT / "proto"
OUT_DIR = ROOT / "generated"


def main():
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir()
    (OUT_DIR / "__init__.py").write_text("")

    proto_files = list(PROTO_DIR.glob("*.proto"))
    if not proto_files:
        print("No .proto files found")
        sys.exit(1)

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "grpc_tools.protoc",
            f"-I{PROTO_DIR}",
            f"--python_out={OUT_DIR}",
            f"--pyi_out={OUT_DIR}",
            f"--grpc_python_out={OUT_DIR}",
            *[str(f) for f in proto_files],
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"protoc failed:\n{result.stderr or result.stdout}")
        sys.exit(1)

    print(f"Generated gRPC code for: {', '.join(f.name for f in proto_files)}")


if __name__ == "__main__":
    main()
