import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROTO_DIR = ROOT / "proto"
OUT_DIR = ROOT / "generated"

# Matches bare imports like: import market_data_pb2 as market__data__pb2
BARE_IMPORT = re.compile(r"^(import\s+\w+_pb2\w*)", re.MULTILINE)


def fix_imports():
    """Convert bare imports to relative so generated/ works as a package."""
    for path in OUT_DIR.glob("*.py*"):
        if path.name == "__init__.py":
            continue
        text = path.read_text()
        fixed = BARE_IMPORT.sub(r"from . \1", text)
        if fixed != text:
            path.write_text(fixed)


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
            f"--grpc_python_out={OUT_DIR}",
            f"--mypy_out={OUT_DIR}",
            f"--mypy_grpc_out={OUT_DIR}",
            *[str(f) for f in proto_files],
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"protoc failed:\n{result.stderr or result.stdout}")
        sys.exit(1)

    fix_imports()
    print(f"Generated gRPC code for: {', '.join(f.name for f in proto_files)}")

    subprocess.run(
        ["uv", "sync", "--reinstall-package", "grpc-demo"],
        capture_output=True,
    )
    print("Reinstalled package with updated generated code.")


if __name__ == "__main__":
    main()
