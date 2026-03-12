require("dotenv").config();

const { runMigrations, closePool } = require("./db");

async function main() {
  await runMigrations();
  console.log("Migrations complete");
}

main()
  .catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
  });
