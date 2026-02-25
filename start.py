import platform
import re
import signal
import subprocess
import sys
import time

PORTS = [50051, 50052, 8000]
processes = []


def kill_ports():
    """Kill any processes already using our ports."""
    if platform.system() == "Windows":
        for port in PORTS:
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True,
                text=True,
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    pid = line.strip().split()[-1]
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        capture_output=True,
                    )
    else:
        for port in PORTS:
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True,
                text=True,
            )
            for pid in result.stdout.strip().splitlines():
                subprocess.run(["kill", "-9", pid], capture_output=True)


def shutdown(sig=None, frame=None):
    for p in processes:
        p.terminate()
    for p in processes:
        p.wait()
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

kill_ports()
time.sleep(1)

processes.append(subprocess.Popen([sys.executable, "services/market_data.py"]))
processes.append(subprocess.Popen([sys.executable, "services/transformer.py"]))

time.sleep(2)

processes.append(
    subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "api.main:app", "--reload", "--port", "8000"]
    )
)

print("\nAll services running:")
print("  MarketData    -> :50051")
print("  Transformer   -> :50052")
print("  Gateway       -> http://localhost:8000")
print("\nPress Ctrl+C to stop all.\n")

try:
    for p in processes:
        p.wait()
except KeyboardInterrupt:
    shutdown()
