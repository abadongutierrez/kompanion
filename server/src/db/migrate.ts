import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./client.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

async function main() {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const already = await sql`
      select 1 from schema_migrations where name = ${file}
    `;
    if (already.length > 0) continue;

    const script = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`applying migration ${file}`);
    await sql.unsafe(script);
    await sql`insert into schema_migrations (name) values (${file})`;
  }

  await sql.end();
  console.log("migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
