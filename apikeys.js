/* ============================================================
   API de consulta — claves de aplicación (app keys)
   Solo lectura. Las genera el rol admin desde la app.
   La clave completa se muestra UNA sola vez: en la base se
   guarda su hash (SHA-256) más un prefijo para identificarla.
   ============================================================ */

const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { query, uuid } = require('./db');

const PREFIJO = 'sf_live_';

const hashClave = (clave) => createHash('sha256').update(String(clave)).digest('hex');

function generarClave() {
  const secreto = randomBytes(24).toString('base64url'); // 32 chars aprox.
  const clave = `${PREFIJO}${secreto}`;
  return { clave, prefijo: clave.slice(0, PREFIJO.length + 6), hash: hashClave(clave) };
}

async function crearApiKey(nombre, usuarioId) {
  const { clave, prefijo, hash } = generarClave();
  await query(
    `INSERT INTO api_keys (id, nombre, prefijo, hash, creada_por, creada) VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid(), String(nombre).trim(), prefijo, hash, usuarioId, new Date().toISOString()]);
  return clave; // única vez que existe en claro
}

async function listarApiKeys() {
  return query(
    `SELECT k.id, k.nombre, k.prefijo, k.creada, k.ultimo_uso, k.usos, k.activa, u.email AS creada_por
       FROM api_keys k LEFT JOIN usuarios u ON u.id = k.creada_por
      ORDER BY k.creada DESC`);
}

async function revocarApiKey(id) {
  await query(`UPDATE api_keys SET activa = 0 WHERE id = ?`, [id]);
}

async function eliminarApiKey(id) {
  await query(`DELETE FROM api_keys WHERE id = ?`, [id]);
}

/* Middleware: exige X-API-Key (o Authorization: Bearer <clave>) válida y activa. */
async function autenticarApiKey(req, res, next) {
  try {
    const cabecera = req.get('X-API-Key') ||
      (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!cabecera) {
      return res.status(401).json({ error: 'Falta la clave de API. Enviala en el header X-API-Key.' });
    }
    const hash = hashClave(cabecera.trim());
    const fila = (await query(`SELECT * FROM api_keys WHERE hash = ?`, [hash]))[0];
    /* comparación en tiempo constante sobre el hash encontrado */
    const ok = fila && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(fila.hash, 'hex'));
    if (!ok) return res.status(401).json({ error: 'Clave de API inválida.' });
    if (!fila.activa) return res.status(403).json({ error: 'Clave de API revocada.' });

    await query(`UPDATE api_keys SET ultimo_uso = ?, usos = usos + 1 WHERE id = ?`,
      [new Date().toISOString(), fila.id]);
    req.apiKey = { id: fila.id, nombre: fila.nombre };
    next();
  } catch (e) { next(e); }
}

module.exports = {
  crearApiKey, listarApiKeys, revocarApiKey, eliminarApiKey, autenticarApiKey,
};
