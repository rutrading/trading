import { $ } from "bun";
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { join } from "path";

const root = join(import.meta.dir, "..");

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

// Copy web/.env.example → web/.env.local (if not exists)
const webEnv = join(root, "web", ".env.local");
if (!existsSync(webEnv)) {
  copyFileSync(join(root, "web", ".env.example"), webEnv);

  // Generate and inject BETTER_AUTH_SECRET
  const secret = randomBytes(32).toString("hex");
  const content = readFileSync(webEnv, "utf-8");
  writeFileSync(webEnv, content.replace("change-me-to-a-random-string", secret));

  console.log("Created web/.env.local with generated BETTER_AUTH_SECRET");
} else {
  console.log("web/.env.local already exists, skipping");
}

// Copy api/.env.example → api/.env (if not exists)
const apiEnv = join(root, "api", ".env");
if (!existsSync(apiEnv)) {
  copyFileSync(join(root, "api", ".env.example"), apiEnv);
  console.log("Created api/.env");
} else {
  console.log("api/.env already exists, skipping");
}

// Copy service .env.example files
const services = ["market_data", "transformer", "filter", "scheduler"];
for (const service of services) {
  const envFile = join(root, "services", service, ".env");
  const envExample = join(root, "services", service, ".env.example");
  if (existsSync(envExample) && !existsSync(envFile)) {
    copyFileSync(envExample, envFile);
    console.log(`Created services/${service}/.env`);
  }
}

// Install dependencies
console.log("Installing web dependencies...");
await $`bun install`.cwd(join(root, "web"));

console.log("Installing API dependencies...");
await $`uv sync`.cwd(join(root, "api"));

// Install service dependencies and generate proto code
console.log("Installing service dependencies...");
for (const service of services) {
  await $`uv sync`.cwd(join(root, "services", service));
}

console.log("Generating gRPC proto code...");
await $`uv run python ${join(root, "scripts", "gen_proto.py")}`.cwd(join(root, "services", "market_data"));

console.log(`
Setup complete! Next steps:

  # Run database migrations
  bun migrate

  # Start the web app
  bun dev

  # Start the API (separate terminal)
  cd api && uv run uvicorn app.main:app --reload

  # Start gRPC services (separate terminal)
  docker compose up -d market-data transformer filter scheduler
  # Or run one locally: cd services/market_data && python -m app.server

Then visit http://localhost:3000/login
`);
