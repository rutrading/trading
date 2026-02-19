"""Generate Python gRPC code from .proto definitions.

Generates protobuf and gRPC stubs into each target's generated/ directory.
Only compiles the proto files each service actually needs (including transitive
dependencies), following the protobuf best practice of minimal dependencies.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTO_DIR = ROOT / "lib" / "proto"
PROTO_PACKAGE_DIR = PROTO_DIR / "trading"

# Map each target to the proto files it needs.
# Transitive deps are included: persistence.proto imports transformer.proto
# which imports market_data.proto, so persistence needs all three.
TARGET_PROTOS: dict[str, list[str]] = {
    "market_data": ["market_data.proto"],
    "transformer": ["market_data.proto", "transformer.proto"],
    "persistence": ["market_data.proto", "transformer.proto", "persistence.proto"],
    "scheduler": ["market_data.proto", "transformer.proto", "persistence.proto"],
}

TARGETS: list[tuple[Path, list[str]]] = [
    (ROOT / "services" / name, protos) for name, protos in TARGET_PROTOS.items()
]
# The API gateway also needs all protos.
TARGETS.append(
    (
        ROOT / "api",
        ["market_data.proto", "transformer.proto", "persistence.proto"],
    )
)


def generate(target_dir: Path, proto_names: list[str]) -> None:
    name = target_dir.name
    out_dir = target_dir / "generated"

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(exist_ok=True)

    (out_dir / "__init__.py").write_text("")

    proto_files = [PROTO_PACKAGE_DIR / p for p in proto_names]
    missing = [p for p in proto_files if not p.exists()]
    if missing:
        print(f"Missing proto files: {missing}")
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

    # Fix imports: protoc generates "from trading import X_pb2 as ..." because
    # protos are in the trading/ package dir. Rewrite to relative imports.
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

    print(f"  {name}: {', '.join(proto_names)}")


def main() -> None:
    print("Generating gRPC code:")
    for target, protos in TARGETS:
        generate(target, protos)
    print("Done.")


if __name__ == "__main__":
    main()
