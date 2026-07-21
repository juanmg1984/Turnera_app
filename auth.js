/* ============================================================
   Autenticación — hash de contraseñas (scrypt) y sesiones en DB
   ============================================================ */

const { scryptSync, randomBytes, timingSafeEqual } = require('node:crypto');
const { query, uuid } = require('./db');

const DIAS_SESION = 30;

function hashPassword(pass) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(pass), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarPassword(pass, guardado) {
  const [salt, hash] = String(guardado).split(':');
  if (!salt || !hash) return false;
  const calc = scryptSync(String(pass), salt, 64);
  const orig = Buffer.from(hash, 'hex');
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}

async function crearSesion(usuarioId) {
  const token = randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DIAS_SESION * 86400e3).toISOString();
  await query(`INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, ?)`,
    [token, usuarioId, expira]);
  return token;
}

async function borrarSesion(token) {
  if (token) await query(`DELETE FROM sesiones WHERE token = ?`, [token]);
}

function leerCookie(req, nombre) {
  const raw = req.headers.cookie || '';
  for (const par of raw.split(';')) {
    const [k, ...v] = par.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setCookieSesion(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `sesion=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${DIAS_SESION * 86400}${secure}`);
}

function limpiarCookieSesion(res) {
  res.setHeader('Set-Cookie', 'sesion=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

/* Middleware: carga req.usuario si hay sesión válida */
async function cargarUsuario(req, res, next) {
  try {
    const token = leerCookie(req, 'sesion');
    req.tokenSesion = token;
    req.usuario = null;
    if (token) {
      const filas = await query(
        `SELECT u.id, u.cliente_id, u.nombre, u.email, u.rol, u.activo, s.expira
           FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token = ?`, [token]);
      const f = filas[0];
      if (f && f.activo && new Date(f.expira) > new Date()) {
        req.usuario = { id: f.id, cliente_id: f.cliente_id, nombre: f.nombre, email: f.email, rol: f.rol };
      }
    }
    next();
  } catch (e) { next(e); }
}

/* Middleware: exige sesión y (opcionalmente) uno de los roles dados */
function requiere(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'Sesión requerida. Iniciá sesión.' });
    if (roles.length && !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para esta operación.' });
    }
    next();
  };
}

module.exports = {
  hashPassword, verificarPassword,
  crearSesion, borrarSesion, setCookieSesion, limpiarCookieSesion,
  cargarUsuario, requiere,
};
