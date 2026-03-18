import { join } from "path";

const root = join(import.meta.dir, "..");

const env = { ...process.env };
delete env.VIRTUAL_ENV;

const proc = Bun.spawn(
  ["uv", "run", "--directory", "backend/api", "uvicorn", "app.main:app", "--reload"],
  {
    cwd: root,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.exit(await proc.exited);
