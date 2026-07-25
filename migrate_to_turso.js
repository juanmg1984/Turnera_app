const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@libsql/client');

// Load test env manually
const envPath = path.join(__dirname, 'env', 'Turnera_app-test.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error("Missing Turso credentials in env/Turnera_app-test.env");
  process.exit(1);
}

const localDb = new DatabaseSync('turnera.db');
const turso = createClient({ url: tursoUrl, authToken: tursoToken });

// Require DDL from db.js (without running initDB)
// Actually we can just require db.js, it will connect to local DB but we only want DDL array.
// But db.js doesn't export DDL.
// We can get all tables from the local db!
const tablasObj = localDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const tablas = tablasObj.map(t => t.name).filter(t => t !== 'sqlite_sequence');

const fsDB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const ddlMatch = fsDB.match(/const DDL = \[([\s\S]*?)\];/);
let DDL = [];
if (ddlMatch) {
  // eval the array content
  DDL = eval('[' + ddlMatch[1] + ']');
}

async function migrate() {
  console.log("Creating tables on Turso...");
  for (const ddl of DDL) {
    await turso.execute(ddl);
  }

  // To avoid duplicate constraints on multiple runs, we can clear the remote tables first
  console.log("Clearing existing data on Turso...");
  for (const tabla of tablas) {
    await turso.execute(`DELETE FROM ${tabla}`);
  }

  for (const tabla of tablas) {
    console.log(`Migrating table: ${tabla}...`);
    const rows = localDb.prepare(`SELECT * FROM ${tabla}`).all();
    if (rows.length === 0) {
      console.log(`  - No rows in ${tabla}, skipping.`);
      continue;
    }

    // Prepare batch inserts
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tabla} (${columns.join(', ')}) VALUES (${placeholders})`;

    const batch = [];
    for (const row of rows) {
      const args = columns.map(col => {
         const val = row[col];
         // Convert BigInt to Number if needed, although node:sqlite returns standard types
         return val;
      });
      batch.push({ sql, args });
    }

    try {
      // Execute in batches to avoid Turso limits
      const BATCH_SIZE = 100;
      for (let i = 0; i < batch.length; i += BATCH_SIZE) {
        const chunk = batch.slice(i, i + BATCH_SIZE);
        await turso.batch(chunk, 'write');
      }
      console.log(`  - Successfully inserted ${rows.length} rows into ${tabla}.`);
    } catch (e) {
      console.error(`  ! Error migrating table ${tabla}:`, e.message);
    }
  }

  console.log("Migration complete!");
}

migrate().catch(console.error);
