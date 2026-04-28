import { join } from "path";

const root = join(import.meta.dir, "..");

const env = { ...process.env };
delete env.VIRTUAL_ENV;

const proc = Bun.spawn(
  ["uv", "run", "--directory", "backend", "uvicorn", "app.main:app", "--reload"],
  {
    cwd: root,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

let shuttingDown = false;

async function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;

  proc.kill(signal);
  const forceKill = setTimeout(() => proc.kill("SIGKILL"), 3000);
  const code = await proc.exited;
  clearTimeout(forceKill);
  process.exit(code);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.exit(await proc.exited);
