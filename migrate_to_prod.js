const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@libsql/client');

// Parse CLI args
const args = process.argv.slice(2);
const envFileArg = args.find(a => a.startsWith('--target-env='))?.split('=')[1] || 'Turnos Aeroplantas.env';
const includeTurnos = args.includes('--include-turnos');
const dryRun = args.includes('--dry-run');

// Tablas maestro para migración inicial (clientes, matrículas/aeronaves, operadores + dependencias)
const MASTER_TABLES = [
  'config',
  'clientes',
  'hangares',
  'abastecedoras',
  'operadores',
  'aeronaves',
  'padron_anac',
  'usuarios'
];

const envPath = path.isAbsolute(envFileArg)
  ? envFileArg
  : (fs.existsSync(path.join(__dirname, envFileArg))
      ? path.join(__dirname, envFileArg)
      : path.join(__dirname, 'env', envFileArg));

console.log(`==================================================`);
console.log(`🚀 INSTANCIA DE MIGRACIÓN INICIAL A PRODUCCIÓN`);
console.log(`==================================================`);
console.log(`📂 Archivo de entorno: ${envPath}`);

if (!fs.existsSync(envPath)) {
  console.error(`❌ Error: No se encontró el archivo de entorno en: ${envPath}`);
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
content.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
});

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error("❌ Error: Faltan credenciales de Turso (TURSO_DATABASE_URL o TURSO_AUTH_TOKEN) en el archivo de entorno.");
  process.exit(1);
}

console.log(`🔗 Destino Turso: ${tursoUrl}`);

// Conexión a la BD local y Turso
const localDb = new DatabaseSync(path.join(__dirname, 'turnera.db'));
const turso = createClient({ url: tursoUrl, authToken: tursoToken });

// Obtener esquemas locales
const tablasObj = localDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
const tablesToMigrate = includeTurnos 
  ? tablasObj.map(t => t.name)
  : tablasObj.map(t => t.name).filter(t => MASTER_TABLES.includes(t));

console.log(`\n📋 Tablas seleccionadas para migrar (${tablesToMigrate.length}):`);
tablesToMigrate.forEach(t => console.log(`   - ${t}`));

async function migrate() {
  if (dryRun) {
    console.log("\n🧪 MODO DRY-RUN: Verificación de datos locales sin modificar producción.");
    for (const tName of tablesToMigrate) {
      const count = localDb.prepare(`SELECT COUNT(*) as cnt FROM ${tName}`).get().cnt;
      console.log(`   - ${tName}: ${count} registros locales listos.`);
    }
    return;
  }

  // 1. Validar conexión
  try {
    await turso.execute("SELECT 1");
    console.log("\n✅ Conexión con Turso Producción establecida exitosamente.");
  } catch (err) {
    console.error("\n❌ Error al conectar con Turso Producción:");
    console.error(`   ${err.message}`);
    console.error(`\n💡 Nota: Asegúrese de que TURSO_AUTH_TOKEN en ${envPath} contenga un token JWT válido generado desde Turso.`);
    process.exit(1);
  }

  // 2. Crear esquemas de tablas en Turso
  console.log("\n🛠️  Creando/Verificando esquemas de tablas en Turso...");
  for (const t of tablasObj) {
    if (t.sql && tablesToMigrate.includes(t.name)) {
      let sql = t.sql.replace(/CREATE TABLE/i, "CREATE TABLE IF NOT EXISTS");
      await turso.execute(sql);
    }
  }

  // 3. Limpiar datos previos en tablas objetivo (para evitar duplicados)
  console.log("\n🧹 Limpiando datos previos en las tablas de producción seleccionadas...");
  for (const tabla of tablesToMigrate) {
    await turso.execute(`DELETE FROM ${tabla}`);
  }

  // 4. Migrar registros por lotes
  console.log("\n📦 Migrando datos maestro...");
  for (const tabla of tablesToMigrate) {
    const rows = localDb.prepare(`SELECT * FROM ${tabla}`).all();
    if (rows.length === 0) {
      console.log(`  - ${tabla}: 0 registros (omitida).`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tabla} (${columns.join(', ')}) VALUES (${placeholders})`;

    const batch = [];
    for (const row of rows) {
      const args = columns.map(col => row[col]);
      batch.push({ sql, args });
    }

    try {
      const BATCH_SIZE = 100;
      for (let i = 0; i < batch.length; i += BATCH_SIZE) {
        const chunk = batch.slice(i, i + BATCH_SIZE);
        await turso.batch(chunk, 'write');
      }
      console.log(`  ✅ ${tabla}: ${rows.length} registros migrados con éxito.`);
    } catch (e) {
      console.error(`  ❌ Error al migrar ${tabla}:`, e.message);
    }
  }

  console.log("\n🎉 ¡Migración inicial de datos maestro a Producción completada con éxito!");
}

migrate().catch(err => {
  console.error("❌ Error inesperado durante la migración:", err);
  process.exit(1);
});
