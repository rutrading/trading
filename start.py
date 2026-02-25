import subprocess
import sys
import time
import signal

processes = []


def shutdown(sig=None, frame=None):
    for p in processes:
        p.terminate()
    for p in processes:
        p.wait()
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

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
