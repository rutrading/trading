import { $ } from "bun";
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { join } from "path";

const backend = join(import.meta.dir, "..");
const root = join(backend, "..");

// Check Docker is running
try {
  await $`docker info`.quiet();
} catch {
  console.error("Docker is not running. Start Docker Desktop and try again.");
  process.exit(1);
}

// Check uv is installed
try {
  await $`uv --version`.quiet();
} catch {
  console.error(
    "uv is not installed. Install it: https://docs.astral.sh/uv/getting-started/installation/"
  );
  process.exit(1);
}

// Start Postgres
console.log("Starting Postgres...");
await $`docker compose up -d db`.cwd(root);

// Copy web/.env.example → web/.env (if not exists)
const webEnv = join(root, "web", ".env");
if (!existsSync(webEnv)) {
  copyFileSync(join(root, "web", ".env.example"), webEnv);

  // Generate and inject BETTER_AUTH_SECRET
  const secret = randomBytes(32).toString("hex");
  const content = readFileSync(webEnv, "utf-8");
  writeFileSync(webEnv, content.replace("change-me-to-a-random-string", secret));

  console.log("Created web/.env with generated BETTER_AUTH_SECRET");
} else {
  console.log("web/.env already exists, skipping");
}

// Copy api/.env.example → api/.env (if not exists)
const apiEnv = join(backend, "api", ".env");
if (!existsSync(apiEnv)) {
  copyFileSync(join(backend, "api", ".env.example"), apiEnv);
  console.log("Created backend/api/.env");
} else {
  console.log("backend/api/.env already exists, skipping");
}

// Copy service .env.example files
const services = ["market_data", "transformer", "persistence", "scheduler"];
for (const service of services) {
  const envFile = join(backend, "services", service, ".env");
  const envExample = join(backend, "services", service, ".env.example");
  if (existsSync(envExample) && !existsSync(envFile)) {
    copyFileSync(envExample, envFile);
    console.log(`Created backend/services/${service}/.env`);
  }
}

// Install dependencies
console.log("Installing web dependencies...");
await $`bun install`.cwd(join(root, "web"));

console.log("Installing Python dependencies...");
await $`uv sync`.cwd(backend);

// Generate proto code
console.log("Generating gRPC proto code...");
await $`uv run python scripts/gen_proto.py`.cwd(backend);

console.log(`
Setup complete! Next steps:

  # Run database migrations
  bun migrate

  # Start everything (web + api + gRPC services)
  bun dev

Then visit http://localhost:3000/login
`);
