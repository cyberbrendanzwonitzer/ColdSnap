const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const config = require("./config");

let pool;

function getPool() {
  if (config.dataMode !== "postgres") {
    throw new Error("Database pool requested while DATA_MODE is not postgres");
  }

  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is required when DATA_MODE=postgres");
    }

    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined
    });
  }

  return pool;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists app_migrations (
      name text primary key,
      run_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query("select name from app_migrations");
  return new Set(result.rows.map((row) => row.name));
}

async function runMigrations() {
  if (config.dataMode !== "postgres") {
    return;
  }

  const migrationsDir = path.resolve(__dirname, "migrations");
  const migrationFiles = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const client = await getPool().connect();

  try {
    await client.query("begin");
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    for (const fileName of migrationFiles) {
      if (applied.has(fileName)) {
        continue;
      }

      const filePath = path.join(migrationsDir, fileName);
      const sql = await fs.readFile(filePath, "utf8");
      await client.query(sql);
      await client.query("insert into app_migrations(name) values($1)", [fileName]);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  getPool,
  runMigrations,
  closePool
};
