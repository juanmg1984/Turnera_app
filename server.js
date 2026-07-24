/* ============================================================
   Turnera Aeroplanta San Fernando — Servidor API + estáticos
   Roles: admin · coordinador · cliente
   El flujo termina con la asignación de abastecedora + operador
   (o la cancelación); la carga en sí se gestiona en otro sistema.
   ============================================================ */

const express = require('express');
const path = require('node:path');
const { query, uuid, init, getConfig } = require('./db');
const {
  hashPassword, verificarPassword, crearSesion, borrarSesion,
  setCookieSesion, limpiarCookieSesion, cargarUsuario, requiere,
} = require('./auth');
const {
  enviarMail, mailConfigurado, mailBienvenida, mailRecuperacion,
  mailPasswordRestablecida, mailTurnoAsignado, mailTurnoCancelado, mailTurnoReprogramado,
} = require('./mailer');
const { enviarMensajeWhatsApp } = require('./whatsapp');
const { randomBytes } = require('node:crypto');
const {
  crearApiKey, listarApiKeys, revocarApiKey, eliminarApiKey, autenticarApiKey,
} = require('./apikeys');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cargarUsuario);

const PUERTO = process.env.PORT || 8642;
const APP_URL = process.env.APP_URL || `http://localhost:${PUERTO}`;

/* ---------------- Constantes de dominio ---------------- */

const GRADOS = ['JET A-1', 'AVGAS 100LL'];
const MOTOR_GRADO = { TURBINA: 'JET A-1', PISTON: 'AVGAS 100LL' };
const FORMAS_PAGO = ['EFECTIVO', 'TARJETA DE CREDITO', 'CUENTA CORRIENTE'];

const errj = (res, code, msg) => res.status(code).json({ error: msg });

const normMat = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
const soloAlnum = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ------------------------------------------------------------
   Canonicalización de matrículas.
   El usuario NO coloca el guión: se eliminan todos los símbolos,
   se detecta el prefijo de país y el sistema arma la forma única
   (LV-ABC, N123AB, …). "lvuno", "LV-UNO" y "lv uno" → "LV-UNO".
   ------------------------------------------------------------ */

const PREFIJOS_MATRICULA = [
  { pref: 'LV', pais: 'Argentina',            guion: true,  sufijo: /^[A-Z0-9]{2,4}$/ },
  { pref: 'LQ', pais: 'Argentina (estatal)',  guion: true,  sufijo: /^[A-Z0-9]{2,4}$/ },
  { pref: 'CX', pais: 'Uruguay',              guion: true,  sufijo: /^[A-Z0-9]{2,4}$/ },
  { pref: 'CC', pais: 'Chile',                guion: true,  sufijo: /^[A-Z0-9]{2,4}$/ },
  { pref: 'CP', pais: 'Bolivia',              guion: true,  sufijo: /^[0-9]{3,4}$/ },
  { pref: 'ZP', pais: 'Paraguay',             guion: true,  sufijo: /^[A-Z0-9]{2,4}$/ },
  { pref: 'OB', pais: 'Perú',                 guion: true,  sufijo: /^[A-Z0-9]{3,5}$/ },
  { pref: 'HK', pais: 'Colombia',             guion: true,  sufijo: /^[A-Z0-9]{3,5}$/ },
  { pref: 'PR', pais: 'Brasil',               guion: true,  sufijo: /^[A-Z]{3}$/ },
  { pref: 'PT', pais: 'Brasil',               guion: true,  sufijo: /^[A-Z]{3}$/ },
  { pref: 'PP', pais: 'Brasil',               guion: true,  sufijo: /^[A-Z]{3}$/ },
  { pref: 'PS', pais: 'Brasil',               guion: true,  sufijo: /^[A-Z]{3}$/ },
  { pref: 'PU', pais: 'Brasil',               guion: true,  sufijo: /^[A-Z]{3}$/ },
  /* EE.UU.: sin guión. 1-5 caracteres: dígitos (sin 0 inicial) y hasta 2 letras finales */
  { pref: 'N',  pais: 'Estados Unidos',       guion: false, sufijo: /^[1-9][0-9]{0,4}$|^[1-9][0-9]{0,3}[A-HJ-NP-Z]$|^[1-9][0-9]{0,2}[A-HJ-NP-Z]{2}$/ },
].sort((a, b) => b.pref.length - a.pref.length);

function canonicalizarMatricula(entrada) {
  const limpia = soloAlnum(entrada);
  if (limpia.length < 3 || limpia.length > 8) {
    return { error: 'Matrícula inválida: escribila sin guión, ej. LVABC (Argentina) o N123AB (EE.UU.).' };
  }
  for (const p of PREFIJOS_MATRICULA) {
    if (!limpia.startsWith(p.pref)) continue;
    const sufijo = limpia.slice(p.pref.length);
    if (!p.sufijo.test(sufijo)) {
      return { error: `El formato no es válido para una matrícula de ${p.pais} (${p.pref}${p.guion ? '-' : ''}…). Revisá lo tipeado: "${limpia}".` };
    }
    return { canonica: p.guion ? `${p.pref}-${sufijo}` : `${p.pref}${sufijo}`, pais: p.pais, prefijo: p.pref };
  }
  return { error: `No se reconoce el prefijo de país de "${limpia}". Se aceptan: ${PREFIJOS_MATRICULA.map(p => p.pref).join(', ')}. Si la aeronave es de otro país, contactá al coordinador de planta.` };
}

/* Heurística de motor a partir del tipo informado por la base externa */
const KW_TURBINA = /LEARJET|LJ\d|CITATION|C\d{3} CITATION|GULFSTREAM|FALCON|GLOBAL|CHALLENGER|PHENOM|PRAETOR|LEGACY|HONDAJET|KING AIR|B200|B350|CARAVAN|PILATUS|PC-?12|PC-?24|TBM|BOEING|AIRBUS|EMBRAER|737|A3\d{2}|E1\d{2}|CRJ|ATR|TWIN OTTER|METRO|JETSTREAM|TURBO COMMANDER|CHEYENNE|CONQUEST/;
const KW_PISTON = /CESSNA 1\d{2}|C1\d{2}|CESSNA 2(0[2568]|10)|SKYHAWK|SKYLANE|PIPER|PA-?(1[18]|2[0248]|3[024689]|44)|ARCHER|SENECA|SARATOGA|CHEROKEE|BONANZA|BARON|MOONEY|CIRRUS SR2|SR2[02]|DA-?20|DA-?40|DA-?42|TECNAM|GRUMMAN AA|ROBIN|AEROBOERO|AERO BOERO/;

function sugerirMotor(a) {
  const texto = `${a.manufacturer || ''} ${a.type || ''} ${a.icao_type || ''}`.toUpperCase();
  if (KW_TURBINA.test(texto)) return 'TURBINA';
  if (KW_PISTON.test(texto)) return 'PISTON';
  return null;
}

function hoyBuenosAires() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return p; // YYYY-MM-DD
}

/* Hora actual en Buenos Aires, formato HH:MM (24 h) */
function horaBuenosAires() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return dp[a.length][b.length];
}

async function generarSlots() {
  const cfg = await getConfig();
  const [hi, mi] = cfg.hora_inicio.split(':').map(Number);
  const [hf, mf] = cfg.hora_fin.split(':').map(Number);
  const paso = Math.max(5, Number(cfg.intervalo_minutos) || 15);
  const slots = [];
  for (let t = hi * 60 + mi; t < hf * 60 + mf; t += paso) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return { slots, capacidad: Number(cfg.capacidad_por_slot) || 2, dias: Number(cfg.dias_anticipacion) || 14 };
}

async function notificar(clienteId, turnoCodigo, mensaje) {
  await query(
    `INSERT INTO notificaciones (id, cliente_id, turno_codigo, mensaje, creada) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), clienteId, turnoCodigo, mensaje, new Date().toISOString()]);
}

async function turnoPorId(id) {
  const r = await query(`SELECT * FROM turnos WHERE id = ?`, [id]);
  return r[0] || null;
}

/* ============================================================
   AUTH
   ============================================================ */

/* Registro autogestionado: crea el cliente + su ÚNICO usuario autogestionado.
   Usuarios adicionales del mismo cliente: solo los agrega el coordinador. */
app.post('/api/auth/registro', async (req, res, next) => {
  try {
    const { cliente, nombre, email, password } = req.body || {};
    const mail = String(email || '').trim().toLowerCase();
    if (!cliente || !String(cliente).trim()) return errj(res, 400, 'Ingresá el nombre del cliente (empresa u operador).');
    if (!nombre || !String(nombre).trim()) return errj(res, 400, 'Ingresá tu nombre.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return errj(res, 400, 'Ingresá un email válido.');
    if (!password || String(password).length < 8) return errj(res, 400, 'La contraseña debe tener al menos 8 caracteres.');

    const dupMail = await query(`SELECT id FROM usuarios WHERE email = ?`, [mail]);
    if (dupMail.length) return errj(res, 409, 'Ya existe un usuario con ese email. Si es tuyo, iniciá sesión.');

    const nombreCli = String(cliente).trim();
    const dupCli = await query(`SELECT id FROM clientes WHERE lower(nombre) = lower(?)`, [nombreCli]);
    if (dupCli.length) {
      return errj(res, 409,
        'Ese cliente ya existe en el sistema. Por seguridad, el registro autogestionado permite un solo usuario por cliente: pedile al coordinador de planta que agregue tu usuario a la cuenta existente.');
    }

    const ahora = new Date().toISOString();
    const clienteId = uuid();
    const usuarioId = uuid();
    await query(`INSERT INTO clientes (id, nombre, autogestionado, creado) VALUES (?, ?, 1, ?)`,
      [clienteId, nombreCli, ahora]);
    await query(
      `INSERT INTO usuarios (id, cliente_id, nombre, email, hash, rol, creado) VALUES (?, ?, ?, ?, ?, 'cliente', ?)`,
      [usuarioId, clienteId, String(nombre).trim(), mail, hashPassword(password), ahora]);

    const token = await crearSesion(usuarioId);
    setCookieSesion(res, token);
    enviarMail(mail, 'Bienvenido/a al sistema de turnos — Aeroplanta San Fernando',
      mailBienvenida(String(nombre).trim(), mail, APP_URL, null, nombreCli)).catch(() => {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const mail = String(req.body?.email || '').trim().toLowerCase();
    const filas = await query(`SELECT * FROM usuarios WHERE email = ?`, [mail]);
    const u = filas[0];
    if (!u || !verificarPassword(req.body?.password || '', u.hash)) {
      return errj(res, 401, 'Email o contraseña incorrectos.');
    }
    if (!u.activo) return errj(res, 403, 'Tu usuario está desactivado. Contactá a la planta.');
    const token = await crearSesion(u.id);
    setCookieSesion(res, token);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    await borrarSesion(req.tokenSesion);
    limpiarCookieSesion(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    if (!req.usuario) return res.json({ usuario: null });
    let clienteNombre = null;
    if (req.usuario.cliente_id) {
      const c = await query(`SELECT nombre FROM clientes WHERE id = ?`, [req.usuario.cliente_id]);
      clienteNombre = c[0]?.nombre || null;
    }
    res.json({ usuario: { ...req.usuario, clienteNombre } });
  } catch (e) { next(e); }
});

/* Cambio de contraseña del propio usuario (requiere la actual) */
app.put('/api/auth/password', requiere(), async (req, res, next) => {
  try {
    const { actual, nueva } = req.body || {};
    const u = (await query(`SELECT * FROM usuarios WHERE id = ?`, [req.usuario.id]))[0];
    if (!u || !verificarPassword(actual || '', u.hash)) {
      return errj(res, 401, 'La contraseña actual no es correcta.');
    }
    if (!nueva || String(nueva).length < 8) return errj(res, 400, 'La contraseña nueva debe tener al menos 8 caracteres.');
    await query(`UPDATE usuarios SET hash = ? WHERE id = ?`, [hashPassword(nueva), u.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Recuperación de contraseña: manda un link por mail (token de 1 hora, un solo uso) */
app.post('/api/auth/olvide', async (req, res, next) => {
  try {
    if (!mailConfigurado()) {
      return errj(res, 503, 'El envío de mails no está configurado en este servidor. Pedile al coordinador o administrador de la planta que restablezca tu contraseña.');
    }
    const mail = String(req.body?.email || '').trim().toLowerCase();
    const u = (await query(`SELECT * FROM usuarios WHERE email = ? AND activo = 1`, [mail]))[0];
    if (u) {
      const token = randomBytes(32).toString('hex');
      const expira = new Date(Date.now() + 3600e3).toISOString();
      await query(`INSERT INTO reset_tokens (token, usuario_id, expira) VALUES (?, ?, ?)`, [token, u.id, expira]);
      await enviarMail(u.email, 'Recuperación de contraseña — Turnos Aeroplanta San Fernando',
        mailRecuperacion(u.nombre, `${APP_URL}/?reset=${token}`));
    }
    /* Respuesta idéntica exista o no el mail: no revelamos qué usuarios existen */
    res.json({ ok: true, mensaje: 'Si el email está registrado, vas a recibir un link para crear una nueva contraseña. Revisá también el correo no deseado.' });
  } catch (e) { next(e); }
});

/* Consumo del link de recuperación */
app.post('/api/auth/reset', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!password || String(password).length < 8) return errj(res, 400, 'La contraseña debe tener al menos 8 caracteres.');
    const t = (await query(
      `SELECT * FROM reset_tokens WHERE token = ? AND usado = 0`, [String(token || '')]))[0];
    if (!t || new Date(t.expira) < new Date()) {
      return errj(res, 400, 'El link de recuperación no es válido o ya venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".');
    }
    await query(`UPDATE usuarios SET hash = ? WHERE id = ?`, [hashPassword(password), t.usuario_id]);
    await query(`UPDATE reset_tokens SET usado = 1 WHERE token = ?`, [t.token]);
    await query(`DELETE FROM sesiones WHERE usuario_id = ?`, [t.usuario_id]); // cierra sesiones viejas
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ============================================================
   CONFIG (lectura autenticada; escritura solo admin)
   ============================================================ */

app.get('/api/config', requiere(), async (req, res, next) => {
  try { res.json({ ...(await getConfig()), mail_configurado: mailConfigurado() }); } catch (e) { next(e); }
});

app.put('/api/config', requiere('admin'), async (req, res, next) => {
  try {
    const permitidas = ['intervalo_minutos', 'hora_inicio', 'hora_fin', 'capacidad_por_slot', 'dias_anticipacion'];
    const b = req.body || {};
    if (b.intervalo_minutos !== undefined) {
      const n = Number(b.intervalo_minutos);
      if (!Number.isInteger(n) || n < 5 || n > 120) return errj(res, 400, 'El intervalo debe ser un entero entre 5 y 120 minutos.');
    }
    for (const k of ['hora_inicio', 'hora_fin']) {
      if (b[k] !== undefined && !/^\d{2}:\d{2}$/.test(b[k])) return errj(res, 400, `${k}: formato HH:MM.`);
    }
    if (b.capacidad_por_slot !== undefined) {
      const n = Number(b.capacidad_por_slot);
      if (!Number.isInteger(n) || n < 1 || n > 20) return errj(res, 400, 'La capacidad por horario debe ser un entero entre 1 y 20.');
    }
    for (const k of permitidas) {
      if (b[k] !== undefined) {
        await query(
          `INSERT INTO config (clave, valor) VALUES (?, ?)
           ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`, [k, String(b[k])]);
      }
    }
    res.json(await getConfig());
  } catch (e) { next(e); }
});

/* ============================================================
   MAESTROS
   ============================================================ */

app.get('/api/hangares', requiere(), async (req, res, next) => {
  try {
    /* El staff puede pedir el listado completo (incluye desactivados) para gestionarlos. */
    const staff = req.usuario.rol !== 'cliente';
    const todos = staff && String(req.query.todos || '') === '1';
    res.json(await query(
      todos ? `SELECT * FROM hangares ORDER BY rowid`
            : `SELECT * FROM hangares WHERE activo = 1 ORDER BY rowid`));
  } catch (e) { next(e); }
});

app.post('/api/hangares', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const codigo = String(req.body?.codigo || '').trim().toUpperCase();
    const nombre = String(req.body?.nombre || '').trim().toUpperCase();
    if (!codigo || !nombre) return errj(res, 400, 'Ingresá código y nombre.');
    const dup = await query(`SELECT codigo FROM hangares WHERE codigo = ?`, [codigo]);
    if (dup.length) return errj(res, 409, `Ya existe el código ${codigo}.`);
    await query(`INSERT INTO hangares (codigo, nombre) VALUES (?, ?)`, [codigo, nombre]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.put('/api/hangares/:codigo', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const { nombre, activo } = req.body || {};
    if (nombre !== undefined) {
      await query(`UPDATE hangares SET nombre = ? WHERE codigo = ?`, [String(nombre).trim().toUpperCase(), req.params.codigo]);
    }
    if (activo !== undefined) {
      await query(`UPDATE hangares SET activo = ? WHERE codigo = ?`, [activo ? 1 : 0, req.params.codigo]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Eliminar hangar / posición. Si está en uso no se borra (se rompería el
   histórico): en ese caso se ofrece desactivarlo para que deje de ofrecerse. */
app.delete('/api/hangares/:codigo', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const codigo = String(req.params.codigo).toUpperCase();
    const h = (await query(`SELECT * FROM hangares WHERE codigo = ?`, [codigo]))[0];
    if (!h) return errj(res, 404, 'Hangar / posición inexistente.');
    const enAeronaves = Number((await query(
      `SELECT COUNT(*) AS n FROM aeronaves WHERE hangar = ?`, [codigo]))[0].n);
    const enTurnos = Number((await query(
      `SELECT COUNT(*) AS n FROM turnos WHERE hangar = ?`, [codigo]))[0].n);
    if (enAeronaves || enTurnos) {
      return errj(res, 409,
        `No se puede eliminar ${codigo}: está en uso (${enAeronaves} aeronave(s) y ${enTurnos} turno(s)). Podés desactivarlo para que deje de ofrecerse sin perder el histórico.`);
    }
    await query(`DELETE FROM hangares WHERE codigo = ?`, [codigo]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/abastecedoras', requiere('admin', 'coordinador'), async (req, res, next) => {
  try { res.json(await query(`SELECT * FROM abastecedoras ORDER BY id`)); } catch (e) { next(e); }
});

app.post('/api/abastecedoras', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const id = String(req.body?.id || '').trim().toUpperCase();
    const nombre = String(req.body?.nombre || '').trim();
    const grado = req.body?.grado;
    const capacidad = Number(req.body?.capacidad);
    if (!id || !nombre || !GRADOS.includes(grado) || !(capacidad > 0)) {
      return errj(res, 400, 'Completá ID, nombre, grado válido y capacidad.');
    }
    const dup = await query(`SELECT id FROM abastecedoras WHERE id = ?`, [id]);
    if (dup.length) return errj(res, 409, `Ya existe la abastecedora ${id}.`);
    await query(`INSERT INTO abastecedoras (id, nombre, grado, capacidad) VALUES (?, ?, ?, ?)`,
      [id, nombre, grado, capacidad]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.put('/api/abastecedoras/:id', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const { capacidad, activa, nombre } = req.body || {};
    const ab = (await query(`SELECT * FROM abastecedoras WHERE id = ?`, [req.params.id]))[0];
    if (!ab) return errj(res, 404, 'Abastecedora inexistente.');
    if (capacidad !== undefined) {
      if (!(Number(capacidad) > 0)) return errj(res, 400, 'Capacidad inválida.');
      await query(`UPDATE abastecedoras SET capacidad = ? WHERE id = ?`, [Number(capacidad), req.params.id]);
    }
    if (nombre !== undefined) await query(`UPDATE abastecedoras SET nombre = ? WHERE id = ?`, [String(nombre).trim(), req.params.id]);
    if (activa !== undefined) await query(`UPDATE abastecedoras SET activa = ? WHERE id = ?`, [activa ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/operadores', requiere('admin', 'coordinador'), async (req, res, next) => {
  try { res.json(await query(`SELECT * FROM operadores ORDER BY nombre`)); } catch (e) { next(e); }
});

app.post('/api/operadores', requiere('admin'), async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return errj(res, 400, 'Ingresá el nombre del operador.');
    await query(`INSERT INTO operadores (id, nombre) VALUES (?, ?)`, [uuid(), nombre]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.put('/api/operadores/:id', requiere('admin'), async (req, res, next) => {
  try {
    if (req.body?.activo !== undefined) {
      await query(`UPDATE operadores SET activo = ? WHERE id = ?`, [req.body.activo ? 1 : 0, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------------- Clientes ---------------- */

app.get('/api/clientes', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    res.json(await query(
      `SELECT c.*, (SELECT COUNT(*) FROM usuarios u WHERE u.cliente_id = c.id) AS usuarios,
              (SELECT COUNT(*) FROM aeronaves a WHERE a.cliente_id = c.id) AS aeronaves
         FROM clientes c ORDER BY c.nombre`));
  } catch (e) { next(e); }
});

app.post('/api/clientes', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return errj(res, 400, 'Ingresá el nombre del cliente.');
    const dup = await query(`SELECT id FROM clientes WHERE lower(nombre) = lower(?)`, [nombre]);
    if (dup.length) return errj(res, 409, 'Ya existe un cliente con ese nombre.');
    await query(`INSERT INTO clientes (id, nombre, autogestionado, creado) VALUES (?, ?, 0, ?)`,
      [uuid(), nombre, new Date().toISOString()]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.put('/api/clientes/:id', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const { nombre, activo } = req.body || {};
    if (nombre !== undefined) await query(`UPDATE clientes SET nombre = ? WHERE id = ?`, [String(nombre).trim(), req.params.id]);
    if (activo !== undefined) await query(`UPDATE clientes SET activo = ? WHERE id = ?`, [activo ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Eliminar cliente: solo si no tiene aeronaves ni turnos (si no, se desactiva). */
app.delete('/api/clientes/:id', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const cli = (await query(`SELECT * FROM clientes WHERE id = ?`, [req.params.id]))[0];
    if (!cli) return errj(res, 404, 'Cliente inexistente.');
    const aeronaves = Number((await query(
      `SELECT COUNT(*) AS n FROM aeronaves WHERE cliente_id = ?`, [cli.id]))[0].n);
    const turnos = Number((await query(
      `SELECT COUNT(*) AS n FROM turnos WHERE cliente_id = ?`, [cli.id]))[0].n);
    if (aeronaves || turnos) {
      return errj(res, 409,
        `No se puede eliminar "${cli.nombre}": tiene ${aeronaves} aeronave(s) y ${turnos} turno(s) en el histórico. Desactivalo para que deje de operar sin perder los datos.`);
    }
    const usuarios = await query(`SELECT id FROM usuarios WHERE cliente_id = ?`, [cli.id]);
    for (const u of usuarios) {
      await query(`DELETE FROM sesiones WHERE usuario_id = ?`, [u.id]);
      await query(`DELETE FROM usuarios WHERE id = ?`, [u.id]);
    }
    await query(`DELETE FROM notificaciones WHERE cliente_id = ?`, [cli.id]);
    await query(`DELETE FROM clientes WHERE id = ?`, [cli.id]);
    res.json({ ok: true, usuarios_eliminados: usuarios.length });
  } catch (e) { next(e); }
});

/* Usuarios de un cliente (para que el coordinador los administre) */
app.get('/api/clientes/:id/usuarios', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    res.json(await query(
      `SELECT id, nombre, email, activo, creado FROM usuarios
        WHERE cliente_id = ? AND rol = 'cliente' ORDER BY nombre`, [req.params.id]));
  } catch (e) { next(e); }
});

/* Editar un usuario de un cliente. El coordinador solo toca usuarios con rol
   cliente que pertenezcan a ese cliente: nunca admins ni coordinadores. */
app.put('/api/clientes/:id/usuarios/:usuarioId', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const u = (await query(
      `SELECT * FROM usuarios WHERE id = ? AND cliente_id = ? AND rol = 'cliente'`,
      [req.params.usuarioId, req.params.id]))[0];
    if (!u) return errj(res, 404, 'Usuario inexistente para ese cliente.');
    const { nombre, activo, password } = req.body || {};
    if (nombre !== undefined && String(nombre).trim()) {
      await query(`UPDATE usuarios SET nombre = ? WHERE id = ?`, [String(nombre).trim(), u.id]);
    }
    if (activo !== undefined) {
      await query(`UPDATE usuarios SET activo = ? WHERE id = ?`, [activo ? 1 : 0, u.id]);
      if (!activo) await query(`DELETE FROM sesiones WHERE usuario_id = ?`, [u.id]);
    }
    let mailEnviado;
    if (password !== undefined) {
      if (String(password).length < 8) return errj(res, 400, 'La contraseña debe tener al menos 8 caracteres.');
      await query(`UPDATE usuarios SET hash = ? WHERE id = ?`, [hashPassword(password), u.id]);
      const m = await enviarMail(u.email, 'Tu contraseña fue restablecida — Turnos Aeroplanta San Fernando',
        mailPasswordRestablecida(u.nombre, u.email, String(password), APP_URL));
      mailEnviado = m.enviado;
    }
    res.json({ ok: true, mail_enviado: mailEnviado });
  } catch (e) { next(e); }
});

/* Usuarios adicionales de un cliente: SOLO coordinador (y admin) */
app.post('/api/clientes/:id/usuarios', requiere('coordinador', 'admin'), async (req, res, next) => {
  try {
    const cli = (await query(`SELECT * FROM clientes WHERE id = ?`, [req.params.id]))[0];
    if (!cli) return errj(res, 404, 'Cliente inexistente.');
    const { nombre, email, password } = req.body || {};
    const mail = String(email || '').trim().toLowerCase();
    if (!nombre || !String(nombre).trim()) return errj(res, 400, 'Ingresá el nombre del usuario.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return errj(res, 400, 'Email inválido.');
    if (!password || String(password).length < 8) return errj(res, 400, 'La contraseña debe tener al menos 8 caracteres.');
    const dup = await query(`SELECT id FROM usuarios WHERE email = ?`, [mail]);
    if (dup.length) return errj(res, 409, 'Ya existe un usuario con ese email.');
    await query(
      `INSERT INTO usuarios (id, cliente_id, nombre, email, hash, rol, creado) VALUES (?, ?, ?, ?, ?, 'cliente', ?)`,
      [uuid(), cli.id, String(nombre).trim(), mail, hashPassword(password), new Date().toISOString()]);
    const m = await enviarMail(mail, 'Tu usuario del sistema de turnos — Aeroplanta San Fernando',
      mailBienvenida(String(nombre).trim(), mail, APP_URL, String(password), cli.nombre));
    res.json({ ok: true, mail_enviado: m.enviado });
  } catch (e) { next(e); }
});

/* ---------------- Usuarios (admin) ---------------- */

app.get('/api/usuarios', requiere('admin'), async (req, res, next) => {
  try {
    res.json(await query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.cliente_id, c.nombre AS cliente
         FROM usuarios u LEFT JOIN clientes c ON c.id = u.cliente_id ORDER BY u.rol, u.nombre`));
  } catch (e) { next(e); }
});

app.post('/api/usuarios', requiere('admin'), async (req, res, next) => {
  try {
    const { nombre, email, password, rol, cliente_id } = req.body || {};
    const mail = String(email || '').trim().toLowerCase();
    if (!['admin', 'coordinador', 'cliente'].includes(rol)) return errj(res, 400, 'Rol inválido.');
    if (rol === 'cliente' && !cliente_id) return errj(res, 400, 'Un usuario con rol cliente debe estar asociado a un cliente.');
    if (!nombre || !String(nombre).trim()) return errj(res, 400, 'Ingresá el nombre.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return errj(res, 400, 'Email inválido.');
    if (!password || String(password).length < 8) return errj(res, 400, 'La contraseña debe tener al menos 8 caracteres.');
    const dup = await query(`SELECT id FROM usuarios WHERE email = ?`, [mail]);
    if (dup.length) return errj(res, 409, 'Ya existe un usuario con ese email.');
    await query(
      `INSERT INTO usuarios (id, cliente_id, nombre, email, hash, rol, creado) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), rol === 'cliente' ? cliente_id : null, String(nombre).trim(), mail, hashPassword(password), rol, new Date().toISOString()]);
    let clienteNombre = null;
    if (rol === 'cliente') {
      clienteNombre = (await query(`SELECT nombre FROM clientes WHERE id = ?`, [cliente_id]))[0]?.nombre || null;
    }
    const m = await enviarMail(mail, 'Tu usuario del sistema de turnos — Aeroplanta San Fernando',
      mailBienvenida(String(nombre).trim(), mail, APP_URL, String(password), clienteNombre));
    res.json({ ok: true, mail_enviado: m.enviado });
  } catch (e) { next(e); }
});

app.put('/api/usuarios/:id', requiere('admin'), async (req, res, next) => {
  try {
    const u = (await query(`SELECT * FROM usuarios WHERE id = ?`, [req.params.id]))[0];
    if (!u) return errj(res, 404, 'Usuario inexistente.');
    const { activo, password, nombre } = req.body || {};
    if (activo !== undefined) {
      if (u.id === req.usuario.id && !activo) return errj(res, 400, 'No podés desactivar tu propio usuario.');
      await query(`UPDATE usuarios SET activo = ? WHERE id = ?`, [activo ? 1 : 0, u.id]);
      if (!activo) await query(`DELETE FROM sesiones WHERE usuario_id = ?`, [u.id]);
    }
    let mailEnviado;
    if (password !== undefined) {
      if (String(password).length < 8) return errj(res, 400, 'La contraseña debe tener al menos 8 caracteres.');
      await query(`UPDATE usuarios SET hash = ? WHERE id = ?`, [hashPassword(password), u.id]);
      const m = await enviarMail(u.email, 'Tu contraseña fue restablecida — Turnos Aeroplanta San Fernando',
        mailPasswordRestablecida(u.nombre, u.email, String(password), APP_URL));
      mailEnviado = m.enviado;
    }
    if (nombre !== undefined) await query(`UPDATE usuarios SET nombre = ? WHERE id = ?`, [String(nombre).trim(), u.id]);
    res.json({ ok: true, mail_enviado: mailEnviado });
  } catch (e) { next(e); }
});

/* ============================================================
   AERONAVES (maestro de matrículas, asociadas a cliente)
   ============================================================ */

app.get('/api/aeronaves', requiere(), async (req, res, next) => {
  try {
    if (req.usuario.rol === 'cliente') {
      return res.json(await query(
        `SELECT a.*, c.nombre AS cliente FROM aeronaves a JOIN clientes c ON c.id = a.cliente_id
          WHERE a.cliente_id = ? AND a.activa = 1 ORDER BY a.matricula`, [req.usuario.cliente_id]));
    }
    res.json(await query(
      `SELECT a.*, c.nombre AS cliente FROM aeronaves a JOIN clientes c ON c.id = a.cliente_id
        ORDER BY a.matricula`));
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------
   Verificación asistida contra el registro público adsbdb.com
   (aeronaves con transpondedor Mode-S vistas por redes ADS-B).
   Es una barrera ASISTIVA: un "no encontrada" no bloquea el alta
   (mucha aviación general no figura), pero un hallazgo permite
   precargar datos y cruzar tipo real vs. motor/grado declarado.
   ------------------------------------------------------------ */

const cacheVerificacion = new Map(); // canonica -> { ts, data }
const TTL_VERIFICACION = 24 * 3600e3;

async function consultarRegistroExterno(canonica) {
  const hit = cacheVerificacion.get(canonica);
  if (hit && Date.now() - hit.ts < TTL_VERIFICACION) return hit.data;
  let data = null; // null = servicio no disponible
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(canonica)}`,
      { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const j = await r.json();
      const a = j?.response?.aircraft;
      if (a) {
        data = {
          encontrada: true,
          tipo: a.type || null, fabricante: a.manufacturer || null,
          icao_type: a.icao_type || null,
          operador: a.registered_owner || null, pais: a.registered_owner_country_name || null,
          sugerencia_motor: sugerirMotor(a),
        };
      }
    } else if (r.status === 404) {
      data = { encontrada: false };
    }
  } catch { /* timeout o red caída: data queda null */ }
  if (data) cacheVerificacion.set(canonica, { ts: Date.now(), data });
  return data;
}

app.get('/api/aeronaves/verificar/:matricula', requiere(), async (req, res, next) => {
  try {
    const c = canonicalizarMatricula(req.params.matricula);
    if (c.error) return res.json({ formato_valido: false, error_formato: c.error });
    const ya = (await query(`SELECT matricula, cliente_id FROM aeronaves WHERE matricula = ?`, [c.canonica]))[0];
    const todas = await query(`SELECT matricula FROM aeronaves WHERE matricula != ?`, [c.canonica]);
    const parecidas = todas.map(r => r.matricula).filter(m => levenshtein(m, c.canonica) <= 1);
    const verificacion = await consultarRegistroExterno(c.canonica);
    res.json({
      formato_valido: true,
      matricula: c.canonica,
      pais: c.pais,
      ya_registrada: !!ya,
      propia: !!ya && req.usuario.rol === 'cliente' && ya.cliente_id === req.usuario.cliente_id,
      parecidas,
      verificacion, // null = servicio externo no disponible
    });
  } catch (e) { next(e); }
});

async function validarAltaAeronave(b, clienteId) {
  const c = canonicalizarMatricula(b.matricula);
  if (c.error) return { error: c.error };
  const matricula = c.canonica;
  const dup = await query(`SELECT matricula FROM aeronaves WHERE matricula = ?`, [matricula]);
  if (dup.length) return { error: `La matrícula ${matricula} ya existe en el maestro (las matrículas son únicas en todo el sistema). Si es tu aeronave y figura en otro cliente, contactá al coordinador.` };
  if (!b.tipo || !String(b.tipo).trim()) return { error: 'Ingresá el tipo de aeronave.' };
  if (!MOTOR_GRADO[b.motor]) return { error: 'Seleccioná el tipo de motor.' };
  if (!GRADOS.includes(b.grado)) return { error: 'Seleccioná el grado de combustible.' };
  if (!(Number(b.capacidad) > 0)) return { error: 'Ingresá la capacidad de combustible en litros.' };
  const hangar = (await query(`SELECT codigo FROM hangares WHERE codigo = ? AND activo = 1`, [b.hangar]))[0];
  if (!hangar) return { error: 'Seleccioná un hangar / plataforma válido.' };

  /* Barrera anti-misfuelling: coherencia motor ↔ grado.
     La excepción (ej. diésel aeronáutico) exige tipear el grado exacto. */
  const excepcion = b.grado !== MOTOR_GRADO[b.motor];
  if (excepcion && String(b.confirmacion_excepcion || '').trim().toUpperCase() !== b.grado) {
    return { error: `Incoherencia motor/grado: para un motor ${b.motor === 'PISTON' ? 'a pistón' : 'de turbina'} el grado esperado es ${MOTOR_GRADO[b.motor]}. Si es una excepción real (ej. motor diésel aeronáutico), confirmá escribiendo exactamente "${b.grado}".` };
  }
  return { matricula, excepcion, clienteId };
}

app.post('/api/aeronaves', requiere(), async (req, res, next) => {
  try {
    const b = req.body || {};
    let clienteId;
    if (req.usuario.rol === 'cliente') clienteId = req.usuario.cliente_id;
    else {
      clienteId = b.cliente_id;
      const c = await query(`SELECT id FROM clientes WHERE id = ?`, [clienteId]);
      if (!c.length) return errj(res, 400, 'Seleccioná el cliente dueño de la aeronave.');
    }
    const v = await validarAltaAeronave(b, clienteId);
    if (v.error) return errj(res, 400, v.error);
    await query(
      `INSERT INTO aeronaves (matricula, tipo, motor, grado, excepcion_grado, cliente_id, hangar, capacidad, creado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.matricula, String(b.tipo).trim(), b.motor, b.grado, v.excepcion ? 1 : 0, clienteId, b.hangar, Number(b.capacidad), new Date().toISOString()]);
    const parecidas = (await query(`SELECT matricula FROM aeronaves WHERE matricula != ?`, [v.matricula]))
      .map(r => r.matricula).filter(m => levenshtein(m, v.matricula) <= 1);
    res.json({ ok: true, matricula: v.matricula, parecidas });
  } catch (e) { next(e); }
});

/* Modificación general de matrícula: admin y coordinador. El grado va por endpoint aparte (solo admin). */
app.put('/api/aeronaves/:matricula', requiere('admin', 'coordinador'), async (req, res, next) => {
  try {
    const m = normMat(req.params.matricula);
    const a = (await query(`SELECT * FROM aeronaves WHERE matricula = ?`, [m]))[0];
    if (!a) return errj(res, 404, 'Matrícula inexistente.');
    const { tipo, cliente_id, hangar, capacidad, activa } = req.body || {};
    if (req.body?.grado !== undefined) return errj(res, 400, 'El grado se cambia únicamente desde "Cambiar grado", con confirmación escrita.');
    if (tipo !== undefined) await query(`UPDATE aeronaves SET tipo = ? WHERE matricula = ?`, [String(tipo).trim(), m]);
    if (cliente_id !== undefined) {
      const c = await query(`SELECT id FROM clientes WHERE id = ?`, [cliente_id]);
      if (!c.length) return errj(res, 400, 'Cliente inexistente.');
      await query(`UPDATE aeronaves SET cliente_id = ? WHERE matricula = ?`, [cliente_id, m]);
    }
    if (hangar !== undefined) await query(`UPDATE aeronaves SET hangar = ? WHERE matricula = ?`, [hangar, m]);
    if (capacidad !== undefined) {
      if (!(Number(capacidad) > 0)) return errj(res, 400, 'Capacidad inválida.');
      await query(`UPDATE aeronaves SET capacidad = ? WHERE matricula = ?`, [Number(capacidad), m]);
    }
    if (activa !== undefined) await query(`UPDATE aeronaves SET activa = ? WHERE matricula = ?`, [activa ? 1 : 0, m]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Cambio de grado: SOLO admin, con confirmación escrita.
   Cancela los turnos activos de la matrícula y avisa al cliente. */
app.put('/api/aeronaves/:matricula/grado', requiere('admin'), async (req, res, next) => {
  try {
    const m = normMat(req.params.matricula);
    const a = (await query(`SELECT * FROM aeronaves WHERE matricula = ?`, [m]))[0];
    if (!a) return errj(res, 404, 'Matrícula inexistente.');
    const nuevo = req.body?.grado;
    if (!GRADOS.includes(nuevo) || nuevo === a.grado) return errj(res, 400, 'Grado nuevo inválido.');
    const esperado = `CAMBIAR GRADO ${m}`;
    if (String(req.body?.confirmacion || '').trim().toUpperCase() !== esperado) {
      return errj(res, 400, `Operación crítica: para ejecutar el cambio escribí exactamente "${esperado}".`);
    }
    const excepcion = nuevo !== MOTOR_GRADO[a.motor] ? 1 : 0;
    await query(`UPDATE aeronaves SET grado = ?, excepcion_grado = ? WHERE matricula = ?`, [nuevo, excepcion, m]);

    const activos = await query(
      `SELECT * FROM turnos WHERE matricula = ? AND estado IN ('PENDIENTE','PROGRAMADO')`, [m]);
    for (const t of activos) {
      await query(
        `UPDATE turnos SET estado = 'CANCELADO', motivo_cancelacion = ? WHERE id = ?`,
        [`Cancelado automáticamente por cambio de grado de ${m} a ${nuevo}. Volvé a solicitar el turno.`, t.id]);
      await notificar(t.cliente_id, t.codigo,
        `⚠ Tu turno ${t.codigo} (${t.fecha} ${t.hora}, ${m}) fue cancelado por un cambio de grado de combustible de la aeronave a ${nuevo}. Solicitá un nuevo turno.`);
    }
    res.json({ ok: true, cancelados: activos.length, excepcion: !!excepcion });
  } catch (e) { next(e); }
});

/* ============================================================
   TURNOS
   ============================================================ */

/* Estados que "reservan" un lugar en la grilla (bloquean capacidad/recurso) */
const ESTADOS_RESERVAN = "('PENDIENTE','PROGRAMADO')";

/* Regla operativa: que una abastecedora esté fuera de servicio solo restringe
   el día en curso (y los pasados). Para fechas futuras se asume que el equipo
   volverá a estar operativo, así que se puede planificar con ella. */
const restringePorServicio = (fecha) => fecha <= hoyBuenosAires();

async function contarAbastecedoras(grado, fecha) {
  const sql = restringePorServicio(fecha)
    ? `SELECT COUNT(*) AS n FROM abastecedoras WHERE grado = ? AND activa = 1`
    : `SELECT COUNT(*) AS n FROM abastecedoras WHERE grado = ?`;
  return Number((await query(sql, [grado]))[0].n);
}

app.get('/api/turnos/slots', requiere(), async (req, res, next) => {
  try {
    const fecha = String(req.query.fecha || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return errj(res, 400, 'Fecha inválida.');
    const grado = GRADOS.includes(req.query.grado) ? req.query.grado : null;
    const { slots, capacidad } = await generarSlots();

    /* ocupación general (no cuenta sobreturnos) */
    const ocupados = await query(
      `SELECT hora, COUNT(*) AS n FROM turnos
        WHERE fecha = ? AND sobreturno = 0 AND estado IN ${ESTADOS_RESERVAN} GROUP BY hora`, [fecha]);
    const mapaGen = Object.fromEntries(ocupados.map(o => [o.hora, Number(o.n)]));

    /* recurso: abastecedoras activas del grado pedido, y su ocupación por horario */
    let recursoGrado = null;
    let mapaGrado = {};
    if (grado) {
      recursoGrado = await contarAbastecedoras(grado, fecha);
      const og = await query(
        `SELECT hora, COUNT(*) AS n FROM turnos
          WHERE fecha = ? AND grado = ? AND sobreturno = 0 AND estado IN ${ESTADOS_RESERVAN} GROUP BY hora`,
        [fecha, grado]);
      mapaGrado = Object.fromEntries(og.map(o => [o.hora, Number(o.n)]));
    }

    /* Si la fecha es hoy, los horarios que ya pasaron no se pueden pedir. */
    const ahora = fecha === hoyBuenosAires() ? horaBuenosAires() : null;

    res.json({
      capacidad, grado, recursoGrado, ahora,
      slots: slots.map(h => {
        const gen = mapaGen[h] || 0;
        const gg = mapaGrado[h] || 0;
        const librePorCapacidad = capacidad - gen;
        const librePorRecurso = recursoGrado === null ? librePorCapacidad : recursoGrado - gg;
        const libres = Math.max(0, Math.min(librePorCapacidad, librePorRecurso));
        const pasado = !!ahora && h <= ahora;
        return {
          hora: h, ocupados: gen, libres: pasado ? 0 : libres,
          pasado,
          lleno: pasado || libres <= 0,
          motivoLleno: pasado ? 'pasado'
            : (libres > 0 ? null
              : (librePorRecurso <= 0 && librePorCapacidad > 0 ? 'recurso' : 'capacidad')),
        };
      }),
    });
  } catch (e) { next(e); }
});

/* Cierre: los turnos PROGRAMADO que hayan superado las 24hs desde su hora de inicio
   y no hayan sido gestionados, se asumen ABASTECIDOS (regla operativa). */
async function barrerAutoAbastecido() {
  const pendientes = await query(
    `SELECT id, fecha, hora, comentario_coordinador FROM turnos WHERE estado = 'PROGRAMADO'`);
  const ahora = Date.now();
  let procesados = 0;
  for (const t of pendientes) {
    const [y, m, d] = t.fecha.split('-').map(Number);
    const [H, M] = t.hora.split(':').map(Number);
    // Usamos new Date() asumiendo que el server corre en la zona horaria correcta
    const dtTurno = new Date(y, m - 1, d, H, M).getTime();
    const ms24h = 24 * 60 * 60 * 1000;
    
    if (ahora > dtTurno + ms24h) {
      const nota = (t.comentario_coordinador ? t.comentario_coordinador + ' · ' : '') +
        'Abastecimiento asumido automáticamente (pasaron 24hs sin gestión).';
      await query(`UPDATE turnos SET estado = 'ABASTECIDO', comentario_coordinador = ? WHERE id = ?`, [nota, t.id]);
      procesados++;
    }
  }
  return procesados;
}

/* Resumen mensual para calendario (coordinador/admin) */
app.get('/api/debug-turnos', async (req, res, next) => {
  try {
    const rows = await db.query(`
      SELECT fecha, 
             COUNT(*) as total,
             SUM(CASE WHEN estado = 'PENDIENTE' THEN 1 ELSE 0 END) as pendientes,
             SUM(CASE WHEN estado = 'PROGRAMADO' THEN 1 ELSE 0 END) as programados
      FROM turnos 
      WHERE fecha LIKE ? AND estado IN ('PENDIENTE', 'PROGRAMADO', 'ABASTECIDO', 'AUSENTE', 'CANCELADO')
      GROUP BY fecha
    `, ['2026-07-%']);
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/turnos/mensual', requiere('coordinador', 'admin'), async (req, res, next) => {
  try {
    const { mes } = req.query; // Formato YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(mes)) return errj(res, 400, 'Mes inválido');
    
    // Traemos todos los turnos del mes y agrupamos en JS
    const rows = await db.query(`
      SELECT fecha, estado
      FROM turnos 
      WHERE fecha LIKE ? AND estado IN ('PENDIENTE', 'PROGRAMADO', 'ABASTECIDO', 'AUSENTE', 'CANCELADO')
    `, [`${mes}-%`]);
    
    const resumen = {};
    for (const r of rows) {
      if (!resumen[r.fecha]) {
        resumen[r.fecha] = { total: 0, pendientes: 0, programados: 0 };
      }
      resumen[r.fecha].total++;
      if (r.estado === 'PENDIENTE') resumen[r.fecha].pendientes++;
      if (r.estado === 'PROGRAMADO') resumen[r.fecha].programados++;
    }
    res.json(resumen);
  } catch (e) { next(e); }
});

app.get('/api/turnos', requiere(), async (req, res, next) => {
  try {
    await barrerAutoAbastecido();
    const base = `
      SELECT t.*, c.nombre AS cliente, o.nombre AS operador
        FROM turnos t
        JOIN clientes c ON c.id = t.cliente_id
        LEFT JOIN operadores o ON o.id = t.operador_id`;
    if (req.usuario.rol === 'cliente') {
      return res.json(await query(
        `${base} WHERE t.cliente_id = ? ORDER BY t.fecha DESC, t.hora DESC`, [req.usuario.cliente_id]));
    }
    const fecha = req.query.fecha;
    if (fecha) return res.json(await query(`${base} WHERE t.fecha = ? ORDER BY t.hora`, [fecha]));
    res.json(await query(`${base} ORDER BY t.fecha DESC, t.hora DESC LIMIT 200`));
  } catch (e) { next(e); }
});

/* Valida fecha/hora. opts: { grado, esSobreturno, saltearLimiteDias }.
   El sobreturno saltea capacidad y recurso; el staff saltea el límite de anticipación. */
async function validarSlot(fecha, hora, ignorarTurnoId, opts = {}) {
  const { grado = null, esSobreturno = false, saltearLimiteDias = false, horarioLibre = false } = opts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return 'Fecha inválida.';
  if (fecha < hoyBuenosAires()) return 'La fecha ya pasó.';
  const { slots, capacidad, dias } = await generarSlots();
  /* El staff puede fijar cualquier horario (fuera de la grilla) en turnos manuales. */
  if (horarioLibre) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora || '')) return 'Horario inválido (formato HH:MM).';
  } else {
    if (!slots.includes(hora)) return 'El horario no corresponde a la grilla de turnos vigente.';
    /* Horarios ya vencidos del día en curso: no se pueden reservar.
       (El staff sí puede, con horario libre, para registrar algo que está pasando.) */
    if (fecha === hoyBuenosAires() && hora <= horaBuenosAires()) {
      return `Ese horario ya pasó (son las ${horaBuenosAires()}). Elegí uno posterior u otra fecha.`;
    }
  }
  if (!saltearLimiteDias) {
    const limite = new Date(Date.now() + dias * 86400e3).toISOString().slice(0, 10);
    if (fecha > limite) return `Solo se pueden pedir turnos hasta ${dias} días de anticipación.`;
  }
  if (esSobreturno) return null; // el sobreturno no consume capacidad ni recurso

  const n = await query(
    `SELECT COUNT(*) AS n FROM turnos
      WHERE fecha = ? AND hora = ? AND sobreturno = 0 AND estado IN ${ESTADOS_RESERVAN} AND id != ?`,
    [fecha, hora, ignorarTurnoId || '']);
  if (Number(n[0].n) >= capacidad) return 'Ese horario ya está completo. Elegí otro (o el coordinador puede generar un sobreturno).';

  if (GRADOS.includes(grado)) {
    const recurso = await contarAbastecedoras(grado, fecha);
    const ng = Number((await query(
      `SELECT COUNT(*) AS n FROM turnos
        WHERE fecha = ? AND hora = ? AND grado = ? AND sobreturno = 0 AND estado IN ${ESTADOS_RESERVAN} AND id != ?`,
      [fecha, hora, grado, ignorarTurnoId || '']))[0].n);
    if (ng >= recurso) return `No hay abastecedoras de ${grado} disponibles en ese horario (${recurso} en la planta). Elegí otro horario${recurso === 0 ? '' : ' o el coordinador puede generar un sobreturno'}.`;
  }
  return null;
}

app.post('/api/turnos', requiere(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const cMat = canonicalizarMatricula(b.matricula);
    if (cMat.error) return errj(res, 400, cMat.error);
    const matricula = cMat.canonica;
    const a = (await query(`SELECT * FROM aeronaves WHERE matricula = ? AND activa = 1`, [matricula]))[0];
    if (!a) return errj(res, 404, 'La matrícula no está registrada. Primero registrá la aeronave.');

    const esStaff = req.usuario.rol === 'coordinador' || req.usuario.rol === 'admin';

    /* El cliente solo puede pedir turnos para SUS matrículas */
    if (!esStaff && a.cliente_id !== req.usuario.cliente_id) {
      return errj(res, 403, `La matrícula ${matricula} no pertenece a tu cuenta. Solo podés pedir turnos para las aeronaves de tu cliente.`);
    }

    /* Sobreturno: solo el staff, para atender pedidos por teléfono/mostrador
       sin gastar los recursos de los turnos ya asignados. */
    const esSobreturno = esStaff && !!b.sobreturno;

    const errSlot = await validarSlot(b.fecha, b.hora, null,
      { grado: a.grado, esSobreturno, saltearLimiteDias: esStaff, horarioLibre: esStaff });
    if (errSlot) return errj(res, 400, errSlot);
    if (!(Number(b.volumen) > 0)) return errj(res, 400, 'Ingresá el volumen aproximado en litros.');
    if (!FORMAS_PAGO.includes(b.forma_pago)) return errj(res, 400, 'Seleccioná la forma de pago.');
    /* Cuenta corriente: el número de cuenta es obligatorio para poder facturar. */
    const cuenta = String(b.cuenta_corriente || '').trim();
    if (b.forma_pago === 'CUENTA CORRIENTE' && !cuenta) {
      return errj(res, 400, 'Ingresá el número de cuenta corriente.');
    }
    const hangar = (await query(`SELECT codigo FROM hangares WHERE codigo = ? AND activo = 1`, [b.hangar]))[0];
    if (!hangar) return errj(res, 400, 'Seleccioná el hangar / plataforma.');

    /* Confirmación positiva anti-misfuelling: tipear la matrícula (solo cliente;
       el staff ve el grado en pantalla y carga turnos manuales con menos fricción).
       El grado NO viene del pedido: se toma SIEMPRE del maestro. */
    if (!esStaff && soloAlnum(b.confirmacion_matricula) !== soloAlnum(matricula)) {
      return errj(res, 400, `Confirmación positiva fallida: escribí la matrícula ${matricula} (con o sin guión) para confirmar el turno.`);
    }

    const cnt = await query(`SELECT COUNT(*) AS n FROM turnos`);
    const codigo = `T-${String(Number(cnt[0].n) + 1).padStart(4, '0')}`;
    await query(
      `INSERT INTO turnos (id, codigo, fecha, hora, matricula, tipo_aeronave, grado, volumen, forma_pago,
                           cuenta_corriente, hangar, motivo, estado, sobreturno, origen, cliente_id, creado_por, creado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, ?)`,
      [uuid(), codigo, b.fecha, b.hora, matricula, a.tipo, a.grado, Number(b.volumen), b.forma_pago,
       b.forma_pago === 'CUENTA CORRIENTE' ? cuenta : '',
       b.hangar, String(b.motivo || '').trim(), esSobreturno ? 1 : 0, esStaff ? 'MANUAL' : 'CLIENTE',
       a.cliente_id, req.usuario.id, new Date().toISOString()]);
    res.json({ ok: true, codigo, grado: a.grado, sobreturno: esSobreturno });
  } catch (e) { next(e); }
});

/* Asignación (coordinador/admin): abastecedora + operador → PROGRAMADO.
   Fin del flujo en este sistema. Notifica al cliente. */
app.put('/api/turnos/:id/asignar', requiere('coordinador', 'admin'), async (req, res, next) => {
  try {
    const t = await turnoPorId(req.params.id);
    if (!t) return errj(res, 404, 'Turno inexistente.');
    if (t.estado !== 'PENDIENTE' && t.estado !== 'PROGRAMADO') {
      return errj(res, 400, `El turno está ${t.estado.toLowerCase()} y no se puede (re)asignar.`);
    }

    const ab = (await query(`SELECT * FROM abastecedoras WHERE id = ?`, [req.body?.abastecedora]))[0];
    if (!ab) return errj(res, 400, 'Seleccioná una abastecedora.');
    /* Fuera de servicio solo bloquea el día en curso: para turnos futuros
       se puede planificar con un equipo que hoy está en taller. */
    if (!ab.activa && restringePorServicio(t.fecha)) {
      return errj(res, 400, `${ab.id} está fuera de servicio y el turno es de hoy (${t.fecha}). Para fechas futuras sí podés asignarla.`);
    }
    const op = (await query(`SELECT * FROM operadores WHERE id = ? AND activo = 1`, [req.body?.operador_id]))[0];
    if (!op) return errj(res, 400, 'Seleccioná un operador activo.');

    /* BLOQUEO DURO ANTI-MISFUELLING: el grado de la abastecedora
       debe coincidir con el del pedido, sin excepciones. */
    if (ab.grado !== t.grado) {
      return errj(res, 409,
        `🚨 ASIGNACIÓN BLOQUEADA — riesgo de misfuelling: la abastecedora ${ab.id} carga ${ab.grado} pero el turno ${t.codigo} (${t.matricula}) es de ${t.grado}. Esta combinación no se puede programar bajo ninguna circunstancia.`);
    }
    const ocupada = await query(
      `SELECT codigo FROM turnos WHERE abastecedora = ? AND fecha = ? AND hora = ? AND estado = 'PROGRAMADO' AND id != ?`,
      [ab.id, t.fecha, t.hora, t.id]);
    if (ocupada.length) return errj(res, 409, `${ab.id} ya está asignada al turno ${ocupada[0].codigo} en ese horario.`);

    await query(`UPDATE turnos SET estado = 'PROGRAMADO', abastecedora = ?, operador_id = ? WHERE id = ?`,
      [ab.id, op.id, t.id]);
    await notificar(t.cliente_id, t.codigo,
      `✅ Tu turno ${t.codigo} fue programado: ${t.fecha} ${t.hora} hs, ${t.matricula} (${t.grado}), abastecedora ${ab.id}, operador ${op.nombre}.`);

    /* Aviso por mail a los usuarios del cliente (además de la notificación en la app). */
    const destinatarios = await query(
      `SELECT email FROM usuarios WHERE cliente_id = ? AND activo = 1`, [t.cliente_id]);
    let mailEnviado = false;
    for (const d of destinatarios) {
      const r = await enviarMail(d.email,
        `Turno ${t.codigo} confirmado — ${t.matricula} el ${t.fecha} ${t.hora} hs`,
        mailTurnoAsignado(t, ab.id, op.nombre, APP_URL));
      mailEnviado = mailEnviado || r.enviado;
    }
    res.json({ ok: true, mail_enviado: mailEnviado, destinatarios: destinatarios.length });
  } catch (e) { next(e); }
});

/* Reprogramación (coordinador/admin): nueva fecha/hora + comentario obligatorio → aviso al cliente */
app.put('/api/turnos/:id/reprogramar', requiere('coordinador', 'admin'), async (req, res, next) => {
  try {
    const t = await turnoPorId(req.params.id);
    if (!t) return errj(res, 404, 'Turno inexistente.');
    if (t.estado === 'CANCELADO') return errj(res, 400, 'El turno está cancelado.');
    const { fecha, hora, comentario } = req.body || {};
    if (!comentario || !String(comentario).trim()) {
      return errj(res, 400, 'Ingresá un comentario para el cliente explicando el cambio de horario.');
    }
    const errSlot = await validarSlot(fecha, hora, t.id,
      { grado: t.grado, esSobreturno: !!t.sobreturno, saltearLimiteDias: true });
    if (errSlot) return errj(res, 400, errSlot);
    if (t.abastecedora) {
      const choque = await query(
        `SELECT codigo FROM turnos WHERE abastecedora = ? AND fecha = ? AND hora = ? AND estado = 'PROGRAMADO' AND id != ?`,
        [t.abastecedora, fecha, hora, t.id]);
      if (choque.length) return errj(res, 409, `La abastecedora ${t.abastecedora} ya está ocupada en el nuevo horario (turno ${choque[0].codigo}).`);
    }
    const anterior = `${t.fecha} ${t.hora}`;
    await query(`UPDATE turnos SET fecha = ?, hora = ?, comentario_coordinador = ? WHERE id = ?`,
      [fecha, hora, String(comentario).trim(), t.id]);
    await notificar(t.cliente_id, t.codigo,
      `🕐 Tu turno ${t.codigo} (${t.matricula}) fue reprogramado: de ${anterior} a ${fecha} ${hora} hs. Comentario del coordinador: "${String(comentario).trim()}"`);
    
    const destinatarios = await query(`SELECT email FROM usuarios WHERE cliente_id = ? AND activo = 1`, [t.cliente_id]);
    let mailEnviado = false;
    // Asumimos que los teléfonos están en un campo si se agregara, por ahora solo stub whatsapp:
    await enviarMensajeWhatsApp('5491100000000', `Tu turno ${t.codigo} fue reprogramado a ${fecha} ${hora}.`);
    
    const turnoActualizado = await turnoPorId(t.id);
    for (const d of destinatarios) {
      const r = await enviarMail(d.email, `Turno ${t.codigo} reprogramado`, mailTurnoReprogramado(turnoActualizado, anterior, comentario, APP_URL));
      mailEnviado = mailEnviado || r.enviado;
    }
    
    res.json({ ok: true, mail_enviado: mailEnviado });
  } catch (e) { next(e); }
});

/* Confirmar abastecimiento (coordinador/admin): cierra el turno programado
   como ABASTECIDO (se cargó) o AUSENTE (no se presentó). */
app.put('/api/turnos/:id/abastecimiento', requiere('coordinador', 'admin'), async (req, res, next) => {
  try {
    const t = await turnoPorId(req.params.id);
    if (!t) return errj(res, 404, 'Turno inexistente.');
    if (t.estado !== 'PROGRAMADO') {
      return errj(res, 400, 'Solo se puede confirmar el abastecimiento de un turno programado.');
    }
    const resultado = req.body?.resultado;
    if (!['ABASTECIDO', 'AUSENTE'].includes(resultado)) {
      return errj(res, 400, 'Indicá el resultado: ABASTECIDO o AUSENTE.');
    }
    await query(`UPDATE turnos SET estado = ? WHERE id = ?`, [resultado, t.id]);
    if (resultado === 'ABASTECIDO') {
      await notificar(t.cliente_id, t.codigo,
        `⛽ Tu turno ${t.codigo} (${t.fecha} ${t.hora}, ${t.matricula}) quedó registrado como ABASTECIDO.`);
    } else {
      await notificar(t.cliente_id, t.codigo,
        `⚠ Tu turno ${t.codigo} (${t.fecha} ${t.hora}, ${t.matricula}) figura como NO PRESENTADO. Si necesitás cargar, solicitá un nuevo turno.`);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Cancelación: coordinador/admin (cualquier turno) o cliente (los suyos). Motivo obligatorio. */
app.put('/api/turnos/:id/cancelar', requiere(), async (req, res, next) => {
  try {
    const t = await turnoPorId(req.params.id);
    if (!t) return errj(res, 404, 'Turno inexistente.');
    if (t.estado === 'CANCELADO') return errj(res, 400, 'El turno ya está cancelado.');
    const motivo = String(req.body?.motivo || '').trim();
    if (!motivo) return errj(res, 400, 'Ingresá el motivo de la cancelación.');

    const esCliente = req.usuario.rol === 'cliente';
    if (esCliente && t.cliente_id !== req.usuario.cliente_id) {
      return errj(res, 403, 'No podés cancelar turnos de otro cliente.');
    }
    await query(`UPDATE turnos SET estado = 'CANCELADO', motivo_cancelacion = ? WHERE id = ?`,
      [`${motivo} (cancelado por ${esCliente ? 'el cliente' : req.usuario.rol})`, t.id]);
    if (!esCliente) {
      await notificar(t.cliente_id, t.codigo,
        `❌ Tu turno ${t.codigo} (${t.fecha} ${t.hora}, ${t.matricula}) fue cancelado por la planta. Motivo: "${motivo}"`);
    } else {
      await notificar(t.cliente_id, t.codigo,
        `❌ Cancelaste tu turno ${t.codigo} (${t.fecha} ${t.hora}, ${t.matricula}). Motivo: "${motivo}"`);
    }

    const destinatarios = await query(`SELECT email FROM usuarios WHERE cliente_id = ? AND activo = 1`, [t.cliente_id]);
    let mailEnviado = false;
    await enviarMensajeWhatsApp('5491100000000', `Tu turno ${t.codigo} fue cancelado. Motivo: ${motivo}`);
    
    for (const d of destinatarios) {
      const r = await enviarMail(d.email, `Turno ${t.codigo} cancelado`, mailTurnoCancelado(t, motivo, APP_URL));
      mailEnviado = mailEnviado || r.enviado;
    }

    res.json({ ok: true, mail_enviado: mailEnviado });
  } catch (e) { next(e); }
});

/* ============================================================
   DASHBOARD (coordinador / admin)
   ============================================================ */

app.get('/api/dashboard', requiere('coordinador', 'admin'), async (req, res, next) => {
  try {
    await barrerAutoAbastecido();
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha : hoyBuenosAires();

    const porEstado = await query(
      `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(volumen),0) AS litros
         FROM turnos WHERE fecha = ? GROUP BY estado`, [fecha]);
    const porGrado = await query(
      `SELECT grado, COUNT(*) AS cantidad, COALESCE(SUM(volumen),0) AS litros
         FROM turnos WHERE fecha = ? AND estado != 'CANCELADO' GROUP BY grado`, [fecha]);
    const porAbastecedora = await query(
      `SELECT t.abastecedora AS id, COUNT(*) AS turnos, COALESCE(SUM(t.volumen),0) AS litros
         FROM turnos t WHERE t.fecha = ? AND t.abastecedora IS NOT NULL AND t.estado != 'CANCELADO'
        GROUP BY t.abastecedora ORDER BY litros DESC`, [fecha]);
    const porCliente = await query(
      `SELECT c.nombre AS cliente, COUNT(*) AS turnos, COALESCE(SUM(t.volumen),0) AS litros
         FROM turnos t JOIN clientes c ON c.id = t.cliente_id
        WHERE t.fecha = ? AND t.estado != 'CANCELADO'
        GROUP BY c.nombre ORDER BY litros DESC LIMIT 8`, [fecha]);
    const proximos = await query(
      `SELECT t.codigo, t.hora, t.matricula, t.grado, t.volumen, t.estado, t.abastecedora,
              t.sobreturno, c.nombre AS cliente
         FROM turnos t JOIN clientes c ON c.id = t.cliente_id
        WHERE t.fecha = ? AND t.estado IN ${ESTADOS_RESERVAN}
        ORDER BY t.hora LIMIT 12`, [fecha]);

    /* ocupación de la grilla del día (sin contar sobreturnos) */
    const { slots, capacidad } = await generarSlots();
    const reservados = Number((await query(
      `SELECT COUNT(*) AS n FROM turnos
        WHERE fecha = ? AND sobreturno = 0 AND estado IN ${ESTADOS_RESERVAN}`, [fecha]))[0].n);
    const sobreturnos = Number((await query(
      `SELECT COUNT(*) AS n FROM turnos WHERE fecha = ? AND sobreturno = 1 AND estado != 'CANCELADO'`,
      [fecha]))[0].n);

    const flota = await query(
      `SELECT grado, COUNT(*) AS total, SUM(CASE WHEN activa = 1 THEN 1 ELSE 0 END) AS operativas
         FROM abastecedoras GROUP BY grado`);

    res.json({
      fecha,
      por_estado: porEstado, por_grado: porGrado,
      por_abastecedora: porAbastecedora, por_cliente: porCliente,
      proximos, flota, sobreturnos,
      grilla: { slots: slots.length, capacidad, cupos: slots.length * capacidad, reservados },
    });
  } catch (e) { next(e); }
});

/* ============================================================
   API KEYS (gestión desde el rol admin)
   ============================================================ */

app.get('/api/apikeys', requiere('admin'), async (req, res, next) => {
  try { res.json(await listarApiKeys()); } catch (e) { next(e); }
});

app.post('/api/apikeys', requiere('admin'), async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return errj(res, 400, 'Poné un nombre que identifique para qué se usa la clave.');
    const clave = await crearApiKey(nombre, req.usuario.id);
    /* Única vez que la clave viaja en claro. */
    res.json({ ok: true, clave });
  } catch (e) { next(e); }
});

app.put('/api/apikeys/:id/revocar', requiere('admin'), async (req, res, next) => {
  try { await revocarApiKey(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});

app.delete('/api/apikeys/:id', requiere('admin'), async (req, res, next) => {
  try { await eliminarApiKey(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});

/* ============================================================
   API v1 — consulta de solo lectura autenticada con app key
   Header:  X-API-Key: sf_live_…   (o Authorization: Bearer …)
   ============================================================ */

const v1 = express.Router();
v1.use(autenticarApiKey);

const limitar = (req, max = 500) => Math.min(Number(req.query.limit) || max, 2000);

v1.get('/', (req, res) => {
  res.json({
    servicio: 'Turnos Aeroplanta San Fernando — API de consulta',
    version: 1,
    solo_lectura: true,
    endpoints: [
      'GET /api/v1/turnos?desde=&hasta=&estado=&cliente=&matricula=&limit=',
      'GET /api/v1/clientes',
      'GET /api/v1/aeronaves?cliente=&grado=',
      'GET /api/v1/abastecedoras',
      'GET /api/v1/hangares',
      'GET /api/v1/resumen?desde=&hasta=',
    ],
  });
});

v1.get('/turnos', async (req, res, next) => {
  try {
    const cond = [], args = [];
    if (req.query.desde) { cond.push('t.fecha >= ?'); args.push(String(req.query.desde)); }
    if (req.query.hasta) { cond.push('t.fecha <= ?'); args.push(String(req.query.hasta)); }
    if (req.query.estado) { cond.push('t.estado = ?'); args.push(String(req.query.estado).toUpperCase()); }
    if (req.query.matricula) { cond.push('t.matricula = ?'); args.push(normMat(req.query.matricula)); }
    if (req.query.cliente) { cond.push('lower(c.nombre) LIKE ?'); args.push(`%${String(req.query.cliente).toLowerCase()}%`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const filas = await query(
      `SELECT t.codigo, t.fecha, t.hora, t.matricula, t.tipo_aeronave, t.grado, t.volumen,
              t.forma_pago, t.cuenta_corriente, t.hangar, t.estado, t.abastecedora, o.nombre AS operador,
              t.sobreturno, t.origen, t.motivo, t.comentario_coordinador, t.motivo_cancelacion,
              c.nombre AS cliente, t.creado
         FROM turnos t
         JOIN clientes c ON c.id = t.cliente_id
         LEFT JOIN operadores o ON o.id = t.operador_id
        ${where} ORDER BY t.fecha DESC, t.hora DESC LIMIT ${limitar(req)}`, args);
    res.json({ total: filas.length, turnos: filas });
  } catch (e) { next(e); }
});

v1.get('/clientes', async (req, res, next) => {
  try {
    res.json(await query(
      `SELECT c.nombre, c.activo, c.creado,
              (SELECT COUNT(*) FROM aeronaves a WHERE a.cliente_id = c.id) AS aeronaves,
              (SELECT COUNT(*) FROM turnos t WHERE t.cliente_id = c.id) AS turnos
         FROM clientes c ORDER BY c.nombre`));
  } catch (e) { next(e); }
});

v1.get('/aeronaves', async (req, res, next) => {
  try {
    const cond = [], args = [];
    if (req.query.grado) { cond.push('a.grado = ?'); args.push(String(req.query.grado)); }
    if (req.query.cliente) { cond.push('lower(c.nombre) LIKE ?'); args.push(`%${String(req.query.cliente).toLowerCase()}%`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    res.json(await query(
      `SELECT a.matricula, a.tipo, a.motor, a.grado, a.excepcion_grado, a.hangar,
              a.capacidad, a.activa, c.nombre AS cliente
         FROM aeronaves a JOIN clientes c ON c.id = a.cliente_id
        ${where} ORDER BY a.matricula LIMIT ${limitar(req)}`, args));
  } catch (e) { next(e); }
});

v1.get('/abastecedoras', async (req, res, next) => {
  try { res.json(await query(`SELECT id, nombre, grado, capacidad, activa FROM abastecedoras ORDER BY id`)); }
  catch (e) { next(e); }
});

v1.get('/hangares', async (req, res, next) => {
  try { res.json(await query(`SELECT codigo, nombre, activo FROM hangares ORDER BY rowid`)); }
  catch (e) { next(e); }
});

v1.get('/resumen', async (req, res, next) => {
  try {
    const desde = String(req.query.desde || hoyBuenosAires());
    const hasta = String(req.query.hasta || desde);
    const porEstado = await query(
      `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(volumen),0) AS litros
         FROM turnos WHERE fecha BETWEEN ? AND ? GROUP BY estado`, [desde, hasta]);
    const porGrado = await query(
      `SELECT grado, COUNT(*) AS cantidad, COALESCE(SUM(volumen),0) AS litros
         FROM turnos WHERE fecha BETWEEN ? AND ? AND estado != 'CANCELADO' GROUP BY grado`, [desde, hasta]);
    const porCliente = await query(
      `SELECT c.nombre AS cliente, COUNT(*) AS turnos, COALESCE(SUM(t.volumen),0) AS litros
         FROM turnos t JOIN clientes c ON c.id = t.cliente_id
        WHERE t.fecha BETWEEN ? AND ? AND t.estado != 'CANCELADO'
        GROUP BY c.nombre ORDER BY litros DESC LIMIT 20`, [desde, hasta]);
    res.json({ desde, hasta, por_estado: porEstado, por_grado: porGrado, por_cliente: porCliente });
  } catch (e) { next(e); }
});

app.use('/api/v1', v1);

/* ============================================================
   NOTIFICACIONES (feedback al cliente dentro de la app)
   ============================================================ */

app.get('/api/notificaciones', requiere('cliente'), async (req, res, next) => {
  try {
    res.json(await query(
      `SELECT * FROM notificaciones WHERE cliente_id = ? ORDER BY creada DESC LIMIT 50`,
      [req.usuario.cliente_id]));
  } catch (e) { next(e); }
});

app.put('/api/notificaciones/leidas', requiere('cliente'), async (req, res, next) => {
  try {
    await query(`UPDATE notificaciones SET leida = 1 WHERE cliente_id = ?`, [req.usuario.cliente_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------------- Errores y arranque ---------------- */

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

init(hashPassword).then(async () => {
  await barrerAutoAbastecido().catch(() => {});
  app.listen(PUERTO, () => console.log(`Turnera San Fernando escuchando en http://localhost:${PUERTO}`));
}).catch(e => { console.error('Error inicializando la base:', e); process.exit(1); });
