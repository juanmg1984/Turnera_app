/* ============================================================
   Capa de datos — SQLite local (node:sqlite) o Turso (libsql http)
   Local:  archivo turnera.db, sin configuración.
   Nube:   variables TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.
   ============================================================ */

const { randomUUID } = require('node:crypto');
const path = require('node:path');

let query; // (sql, args?) => Promise<rows[]>

if (process.env.TURSO_DATABASE_URL) {
  const { createClient } = require('@libsql/client/http');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  query = async (sql, args = []) => {
    const r = await client.execute({ sql, args });
    return r.rows;
  };
} else {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(__dirname, 'turnera.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  query = async (sql, args = []) => {
    const st = db.prepare(sql);
    if (/^\s*(select|pragma)/i.test(sql)) return st.all(...args);
    st.run(...args);
    return [];
  };
}

const uuid = () => randomUUID();

/* ---------------- Esquema ---------------- */

/* Definición de la tabla de turnos (reutilizada por la migración).
   Estados: PENDIENTE → PROGRAMADO → ABASTECIDO | AUSENTE, o CANCELADO.
   sobreturno = 1: turno extra que NO consume capacidad ni recurso.
   origen: CLIENTE (autogestión) | MANUAL (alta del coordinador). */
const TURNOS_DDL = `CREATE TABLE IF NOT EXISTS turnos (
     id TEXT PRIMARY KEY, codigo TEXT NOT NULL UNIQUE,
     fecha TEXT NOT NULL, hora TEXT NOT NULL,
     matricula TEXT NOT NULL, tipo_aeronave TEXT NOT NULL, grado TEXT NOT NULL,
     volumen INTEGER NOT NULL, forma_pago TEXT NOT NULL,
     hangar TEXT NOT NULL, motivo TEXT DEFAULT '',
     estado TEXT NOT NULL DEFAULT 'PENDIENTE'
       CHECK (estado IN ('PENDIENTE','PROGRAMADO','ABASTECIDO','AUSENTE','CANCELADO')),
     abastecedora TEXT, operador_id TEXT,
     sobreturno INTEGER NOT NULL DEFAULT 0,
     origen TEXT NOT NULL DEFAULT 'CLIENTE',
     cuenta_corriente TEXT DEFAULT '',
     comentario_coordinador TEXT DEFAULT '',
     motivo_cancelacion TEXT DEFAULT '',
     cliente_id TEXT NOT NULL, creado_por TEXT NOT NULL, creado TEXT NOT NULL)`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS config (
     clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS clientes (
     id TEXT PRIMARY KEY, nombre TEXT NOT NULL UNIQUE,
     autogestionado INTEGER NOT NULL DEFAULT 0,
     activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS usuarios (
     id TEXT PRIMARY KEY, cliente_id TEXT,
     nombre TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
     hash TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('admin','coordinador','cliente')),
     activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sesiones (
     token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, expira TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reset_tokens (
     token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL,
     expira TEXT NOT NULL, usado INTEGER NOT NULL DEFAULT 0)`,
  /* Claves de la API de consulta (solo lectura). Se guarda el hash:
     la clave completa se muestra una única vez al generarla. */
  `CREATE TABLE IF NOT EXISTS api_keys (
     id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
     prefijo TEXT NOT NULL, hash TEXT NOT NULL UNIQUE,
     creada_por TEXT NOT NULL, creada TEXT NOT NULL,
     ultimo_uso TEXT, usos INTEGER NOT NULL DEFAULT 0,
     activa INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS hangares (
     codigo TEXT PRIMARY KEY, nombre TEXT NOT NULL,
     activo INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS abastecedoras (
     id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
     grado TEXT NOT NULL CHECK (grado IN ('JET A-1','AVGAS 100LL')),
     capacidad INTEGER NOT NULL, activa INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS operadores (
     id TEXT PRIMARY KEY, nombre TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS aeronaves (
     matricula TEXT PRIMARY KEY, tipo TEXT NOT NULL,
     motor TEXT NOT NULL CHECK (motor IN ('TURBINA','PISTON')),
     grado TEXT NOT NULL CHECK (grado IN ('JET A-1','AVGAS 100LL')),
     excepcion_grado INTEGER NOT NULL DEFAULT 0,
     cliente_id TEXT NOT NULL, hangar TEXT NOT NULL,
     capacidad INTEGER NOT NULL, activa INTEGER NOT NULL DEFAULT 1,
     creado TEXT NOT NULL)`,
  TURNOS_DDL,
  `CREATE TABLE IF NOT EXISTS notificaciones (
     id TEXT PRIMARY KEY, cliente_id TEXT NOT NULL,
     turno_codigo TEXT, mensaje TEXT NOT NULL,
     leida INTEGER NOT NULL DEFAULT 0, creada TEXT NOT NULL)`,
];

const CONFIG_DEFAULT = {
  intervalo_minutos: '15',
  hora_inicio: '08:00',
  hora_fin: '18:00',
  capacidad_por_slot: '2',
  dias_anticipacion: '14',
};

/* ---------------- Seed ---------------- */

async function seed(hashPassword) {
  const ahora = new Date().toISOString();

  for (const [clave, valor] of Object.entries(CONFIG_DEFAULT)) {
    await query(`INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)`, [clave, valor]);
  }

  const yaHay = await query(`SELECT COUNT(*) AS n FROM usuarios`);
  if (Number(yaHay[0].n) > 0) return;

  const HANGARES = [
    ['H1', 'HANGAR UNO'], ['H2', 'EX IBARRA'], ['H3', 'AVIACION SAN FERNANDO'],
    ['H4', 'CIELO'], ['H5', 'AMERICAN JET'], ['H6', 'TENIL'], ['H7', 'PEDRO GOZO'],
    ['H8', 'PACIFIC OCEAN'], ['H9', 'GLOBAL OIL'], ['H10', 'AEROMECANICA'],
    ['H11', 'AVIONES PRIVADOS'], ['H12', 'SUNDOWNJET'], ['H13', 'AERORUTAS NUEVO'],
    ['H14', 'NB'], ['PP', 'PLATAFORMA PRINCIPAL'], ['PN', 'PLATAFORMA NORTE'],
  ];
  for (const [c, n] of HANGARES) {
    await query(`INSERT INTO hangares (codigo, nombre) VALUES (?, ?)`, [c, n]);
  }

  for (const [id, nombre, grado, cap] of [
    ['AB-01', 'Abastecedora 01', 'JET A-1', 10000],
    ['AB-02', 'Abastecedora 02', 'JET A-1', 5000],
    ['AB-03', 'Abastecedora 03', 'AVGAS 100LL', 3000],
  ]) {
    await query(`INSERT INTO abastecedoras (id, nombre, grado, capacidad) VALUES (?, ?, ?, ?)`,
      [id, nombre, grado, cap]);
  }

  for (const nombre of ['Carlos Medina', 'Roberto Paz', 'Diego Suárez']) {
    await query(`INSERT INTO operadores (id, nombre) VALUES (?, ?)`, [uuid(), nombre]);
  }

  const cliAJ = uuid(), cliASF = uuid(), cliTenil = uuid();
  for (const [id, nombre] of [
    [cliAJ, 'American Jet S.A.'], [cliASF, 'Aviación San Fernando'], [cliTenil, 'Tenil S.A.'],
  ]) {
    await query(`INSERT INTO clientes (id, nombre, autogestionado, creado) VALUES (?, ?, 0, ?)`,
      [id, nombre, ahora]);
  }

  const AERONAVES = [
    ['LV-CDS', 'Learjet 60',     'TURBINA', 'JET A-1',     0, cliAJ,   'H5', 4000],
    ['LV-BXU', 'King Air B200',  'TURBINA', 'JET A-1',     0, cliAJ,   'H5', 2000],
    ['LV-GOK', 'Cessna 172N',    'PISTON',  'AVGAS 100LL', 0, cliASF,  'H3', 160],
    ['LV-JMB', 'Piper PA-28',    'PISTON',  'AVGAS 100LL', 0, cliASF,  'H3', 180],
    ['LV-CET', 'DA-42 (diésel)', 'PISTON',  'JET A-1',     1, cliTenil,'H6', 190],
  ];
  for (const [m, t, mo, g, ex, cid, h, cap] of AERONAVES) {
    await query(
      `INSERT INTO aeronaves (matricula, tipo, motor, grado, excepcion_grado, cliente_id, hangar, capacidad, creado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [m, t, mo, g, ex, cid, h, cap, ahora]);
  }

  const USUARIOS = [
    ['Administrador', 'juanmg1984@gmail.com', 'admin1234', 'admin', null],
    ['Coordinador de planta', 'coordinador@sanfernando.demo', 'coord1234', 'coordinador', null],
    ['Operaciones American Jet', 'demo@americanjet.demo', 'cliente1234', 'cliente', cliAJ],
  ];
  for (const [nombre, email, pass, rol, cid] of USUARIOS) {
    await query(
      `INSERT INTO usuarios (id, cliente_id, nombre, email, hash, rol, creado) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), cid, nombre, email.toLowerCase(), hashPassword(pass), rol, ahora]);
  }
}

/* Migración: si existe una tabla turnos con el esquema viejo (3 estados,
   sin sobreturno/origen), se reconstruye preservando los datos. Corre una
   sola vez; en bases nuevas no hace nada. */
async function migrar() {
  const info = await query(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'turnos'`);
  const sql = info[0]?.sql || '';
  if (!sql || sql.includes('sobreturno')) return; // ya migrada o inexistente

  await query(`ALTER TABLE turnos RENAME TO turnos_old`);
  await query(TURNOS_DDL);
  await query(
    `INSERT INTO turnos (id, codigo, fecha, hora, matricula, tipo_aeronave, grado,
        volumen, forma_pago, hangar, motivo, estado, abastecedora, operador_id,
        comentario_coordinador, motivo_cancelacion, cliente_id, creado_por, creado)
     SELECT id, codigo, fecha, hora, matricula, tipo_aeronave, grado,
        volumen, forma_pago, hangar, motivo, estado, abastecedora, operador_id,
        comentario_coordinador, motivo_cancelacion, cliente_id, creado_por, creado
     FROM turnos_old`);
  await query(`DROP TABLE turnos_old`);
  console.log('Migración aplicada: tabla turnos actualizada (sobreturno, origen, nuevos estados).');
}

/* Agrega una columna si todavía no existe (migraciones incrementales simples). */
async function asegurarColumna(tabla, columna, definicion) {
  const cols = await query(`PRAGMA table_info(${tabla})`);
  if (!cols.some(c => c.name === columna)) {
    await query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    console.log(`Migración aplicada: ${tabla}.${columna}`);
  }
}

async function init(hashPassword) {
  for (const sql of SCHEMA) await query(sql);
  await migrar();
  await asegurarColumna('turnos', 'cuenta_corriente', `TEXT DEFAULT ''`);
  await seed(hashPassword);
}

async function getConfig() {
  const rows = await query(`SELECT clave, valor FROM config`);
  const c = {};
  for (const r of rows) c[r.clave] = r.valor;
  return c;
}

module.exports = { query, uuid, init, getConfig };
