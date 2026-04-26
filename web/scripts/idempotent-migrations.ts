import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const rewrite = (sql: string): string => {
  let out = sql;

  out = out.replace(/CREATE TABLE (?!IF NOT EXISTS)"/g, 'CREATE TABLE IF NOT EXISTS "');
  out = out.replace(/CREATE INDEX (?!IF NOT EXISTS)"/g, 'CREATE INDEX IF NOT EXISTS "');
  out = out.replace(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)"/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  out = out.replace(/ADD COLUMN (?!IF NOT EXISTS)"/g, 'ADD COLUMN IF NOT EXISTS "');
  out = out.replace(/ADD VALUE (?!IF NOT EXISTS)'/g, "ADD VALUE IF NOT EXISTS '");
  out = out.replace(/DROP TABLE (?!IF EXISTS)"/g, 'DROP TABLE IF EXISTS "');
  out = out.replace(/DROP TYPE (?!IF EXISTS)"/g, 'DROP TYPE IF EXISTS "');

  // NOTE: `$$` in a String.replace replacement string is the escape for a literal
  // `$`. To emit the SQL DO-block dollar-quote `$$`, write `$$$$` here.
  out = out.replace(
    /^(CREATE TYPE [^;]+;)/gm,
    "DO $$$$ BEGIN $1 EXCEPTION WHEN duplicate_object THEN NULL; END $$$$;",
  );

  out = out.replace(
    /^(ALTER TABLE "[^"]+" ADD CONSTRAINT [^;]+;)/gm,
    "DO $$$$ BEGIN $1 EXCEPTION WHEN duplicate_object THEN NULL; END $$$$;",
  );

  return out;
};

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
let changed = 0;
for (const file of files) {
  const path = join(MIGRATIONS_DIR, file);
  const before = readFileSync(path, "utf8");
  const after = rewrite(before);
  if (before !== after) {
    writeFileSync(path, after);
    changed++;
    console.log(`rewrote ${file}`);
  }
}
console.log(`${changed} file(s) updated`);
