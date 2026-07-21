/* ============================================================
   Turnera Aeroplanta San Fernando — Frontend SPA
   Login por roles: admin · coordinador · cliente
   ============================================================ */

/* ---------------- Estado global ---------------- */

let USER = null;
let VISTA = null;
let CONFIG = {};
let TAB_MAESTRO = 'aeronaves';
let FILTRO_FECHA = null;
let NOTIS = [];

const GRADOS = ['JET A-1', 'AVGAS 100LL'];
const MOTORES = {
  TURBINA: { nombre: 'Turbina (turbohélice / jet)', gradoEsperado: 'JET A-1' },
  PISTON:  { nombre: 'Pistón (motor alternativo)',  gradoEsperado: 'AVGAS 100LL' },
};
const FORMAS_PAGO = ['EFECTIVO', 'TARJETA DE CREDITO', 'CUENTA CORRIENTE'];
const ESTADOS = {
  PENDIENTE:  { nombre: 'Pendiente de asignación', color: '#b45309', bg: '#fef3c7' },
  PROGRAMADO: { nombre: 'Programado',              color: '#1d4ed8', bg: '#dbeafe' },
  ABASTECIDO: { nombre: 'Abastecido',              color: '#15803d', bg: '#dcfce7' },
  AUSENTE:    { nombre: 'No se presentó',          color: '#9a3412', bg: '#ffedd5' },
  CANCELADO:  { nombre: 'Cancelado',               color: '#6b7280', bg: '#f3f4f6' },
};

/* Estado del wizard del cliente */
let W = null;
function wizardNuevo() {
  W = { paso: 1, fecha: null, hora: null, slots: [], capacidad: 2,
        matricula: '', aeronave: null, esNueva: false,
        nueva: { tipo: '', motor: '', grado: '', hangar: '', capacidad: '' },
        volumen: '', formaPago: '', hangar: '', motivo: '' };
}
wizardNuevo();

/* ---------------- Utilidades ---------------- */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(ruta, metodo = 'GET', body) {
  const r = await fetch(ruta, {
    method: metodo,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

function claseGrado(g) { return g === 'JET A-1' ? 'jet' : 'avgas'; }
function badgeGrado(g, grande) {
  return `<span class="badge-grado ${claseGrado(g)} ${grande ? 'grande' : ''}">${esc(g)}</span>`;
}
function badgeEstado(estado) {
  const e = ESTADOS[estado] || { nombre: estado, color: '#333', bg: '#eee' };
  return `<span class="badge-estado" style="color:${e.color};background:${e.bg}">${e.nombre}</span>`;
}
function bannerGrado(g, sub) {
  return `<div class="banner-grado ${claseGrado(g)}">
    <div class="titulo">⛽ ${esc(g)}</div>
    <div class="detalle">${esc(sub)} · Código de color internacional: ${g === 'JET A-1' ? 'NEGRO' : 'ROJO'}</div>
  </div>`;
}
function normMat(s) { return (s || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, ''); }

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fechaLegible(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dt = new Date(y, m - 1, d);
  return `${dias[dt.getDay()]} ${d} de ${meses[m - 1]} de ${y}`;
}

/* ---------------- Modales ---------------- */

function modal(html) {
  $('#modal-raiz').innerHTML =
    `<div class="modal-fondo" onclick="if(event.target===this)cerrarModal()"><div class="modal">${html}</div></div>`;
}
function cerrarModal() { $('#modal-raiz').innerHTML = ''; }
function alertaModal(titulo, texto) {
  modal(`<h3>${esc(titulo)}</h3><p style="font-size:14.5px;line-height:1.6;white-space:pre-line">${esc(texto)}</p>
    <div class="botonera"><button class="btn btn-verde" onclick="cerrarModal()">Entendido</button></div>`);
}
function errorModal(e) { alertaModal('Atención', e.message || String(e)); }

/* ============================================================
   ARRANQUE Y SESIÓN
   ============================================================ */

async function iniciar() {
  try {
    const me = await api('/api/auth/me');
    USER = me.usuario;
  } catch { USER = null; }
  if (USER) {
    CONFIG = await api('/api/config').catch(() => ({}));
    VISTA = USER.rol === 'cliente' ? 'pedir' : 'agenda';
    if (USER.rol === 'cliente') cargarNotis();
  }
  render();
}

async function cargarNotis() {
  try { NOTIS = await api('/api/notificaciones'); renderNavSolo(); } catch {}
}

async function login(email, pass) {
  try {
    await api('/api/auth/login', 'POST', { email, password: pass });
    await iniciar();
  } catch (e) { errorModal(e); }
}

async function logout() {
  await api('/api/auth/logout', 'POST', {}).catch(() => {});
  USER = null; wizardNuevo(); NOTIS = [];
  render();
}

/* ============================================================
   PANTALLA DE LOGIN / REGISTRO
   ============================================================ */

let MODO_LOGIN = 'login';

function renderLogin() {
  $('#header').classList.add('oculto');
  $('#footer').classList.add('oculto');
  const esLogin = MODO_LOGIN === 'login';
  $('#main').innerHTML = `
    <div class="login-wrap">
      <div class="panel">
        <div class="login-logo"><div class="iso">YPF</div></div>
        <h2>Turnos de Carga — Aeroplanta San Fernando</h2>
        <p class="subtitulo">${esLogin ? 'Ingresá con tu email y contraseña' : 'Creá la cuenta de tu empresa (un usuario por cliente)'}</p>
        ${esLogin ? '' : `
        <div class="fila-login">
          <label>Cliente (empresa / operador):</label>
          <input type="text" id="lg-cliente" placeholder="Ej.: Fly Andes S.A.">
        </div>
        <div class="fila-login">
          <label>Tu nombre:</label>
          <input type="text" id="lg-nombre" placeholder="Nombre y apellido">
        </div>`}
        <div class="fila-login">
          <label>Email:</label>
          <input type="text" id="lg-email" placeholder="tu@email.com">
        </div>
        <div class="fila-login">
          <label>Contraseña:${esLogin ? '' : ' <small style="font-weight:400">(mínimo 8 caracteres)</small>'}</label>
          <input type="password" id="lg-pass" onkeydown="if(event.key==='Enter')enviarLogin()">
        </div>
        <div class="botonera" style="margin-top:14px">
          <button class="btn btn-verde" style="min-width:100%" onclick="enviarLogin()">
            ${esLogin ? 'Ingresar' : 'Crear cuenta'}</button>
        </div>
        <div class="login-alt">
          ${esLogin
            ? '¿Primera vez? <a onclick="MODO_LOGIN=\'registro\';render()">Registrá tu empresa como cliente</a><br><a onclick="abrirOlvide()" style="font-weight:400">¿Olvidaste tu contraseña?</a>'
            : '¿Ya tenés cuenta? <a onclick="MODO_LOGIN=\'login\';render()">Iniciar sesión</a>'}
        </div>
        ${esLogin ? '' : `<div class="alerta azul" style="margin-top:16px">El registro autogestionado crea <strong>un usuario por cliente</strong>. Si tu empresa ya tiene cuenta y necesitás otro usuario, lo agrega el coordinador de planta.</div>`}
      </div>
    </div>`;
}

/* ---------- Recuperación y cambio de contraseña ---------- */

function abrirOlvide() {
  modal(`<h3>Recuperar contraseña</h3>
    <p class="subtitulo">Te enviamos un link por mail para crear una contraseña nueva.</p>
    <div class="fila-form"><label>Tu email:</label>
      <div class="campo"><input type="text" id="ol-email" placeholder="tu@email.com"
        onkeydown="if(event.key==='Enter')enviarOlvide()"></div></div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="enviarOlvide()">Enviar link de recuperación</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
}

async function enviarOlvide() {
  try {
    const r = await api('/api/auth/olvide', 'POST', { email: $('#ol-email').value });
    cerrarModal();
    alertaModal('Revisá tu correo', r.mensaje);
  } catch (e) { errorModal(e); }
}

function renderReset(token) {
  $('#header').classList.add('oculto');
  $('#footer').classList.add('oculto');
  $('#main').innerHTML = `
    <div class="login-wrap">
      <div class="panel">
        <div class="login-logo"><div class="iso">YPF</div></div>
        <h2>Crear nueva contraseña</h2>
        <p class="subtitulo">Elegí tu nueva contraseña (mínimo 8 caracteres)</p>
        <div class="fila-login"><label>Contraseña nueva:</label>
          <input type="password" id="rs-pass1"></div>
        <div class="fila-login"><label>Repetila:</label>
          <input type="password" id="rs-pass2" onkeydown="if(event.key==='Enter')enviarReset('${esc(token)}')"></div>
        <div class="botonera" style="margin-top:14px">
          <button class="btn btn-verde" style="min-width:100%" onclick="enviarReset('${esc(token)}')">Guardar contraseña</button>
        </div>
        <div class="login-alt"><a onclick="history.replaceState(null,'','/');render()">Volver al inicio de sesión</a></div>
      </div>
    </div>`;
}

async function enviarReset(token) {
  const p1 = $('#rs-pass1').value, p2 = $('#rs-pass2').value;
  if (p1 !== p2) return alertaModal('No coinciden', 'Las dos contraseñas tienen que ser iguales.');
  try {
    await api('/api/auth/reset', 'POST', { token, password: p1 });
    history.replaceState(null, '', '/');
    RESET_TOKEN = null;
    render();
    alertaModal('✅ Contraseña actualizada', 'Ya podés iniciar sesión con tu nueva contraseña.');
  } catch (e) { errorModal(e); }
}

function abrirCambioPassword() {
  modal(`<h3>🔑 Cambiar mi contraseña</h3>
    <div class="fila-form"><label>Contraseña actual:</label>
      <div class="campo"><input type="password" id="cp-actual"></div></div>
    <div class="fila-form"><label>Contraseña nueva:<small>Mínimo 8 caracteres</small></label>
      <div class="campo"><input type="password" id="cp-nueva"></div></div>
    <div class="fila-form"><label>Repetila:</label>
      <div class="campo"><input type="password" id="cp-nueva2"></div></div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="enviarCambioPassword()">Guardar</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
}

async function enviarCambioPassword() {
  if ($('#cp-nueva').value !== $('#cp-nueva2').value) {
    return alertaModal('No coinciden', 'Las dos contraseñas nuevas tienen que ser iguales.');
  }
  try {
    await api('/api/auth/password', 'PUT', { actual: $('#cp-actual').value, nueva: $('#cp-nueva').value });
    cerrarModal();
    alertaModal('✅ Contraseña cambiada', 'Tu contraseña quedó actualizada.');
  } catch (e) { errorModal(e); }
}

async function enviarLogin() {
  const email = $('#lg-email').value.trim();
  const pass = $('#lg-pass').value;
  if (MODO_LOGIN === 'login') return login(email, pass);
  try {
    await api('/api/auth/registro', 'POST', {
      cliente: $('#lg-cliente').value, nombre: $('#lg-nombre').value, email, password: pass,
    });
    await iniciar();
  } catch (e) { errorModal(e); }
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */

let RESET_TOKEN = new URLSearchParams(location.search).get('reset');

function render() {
  if (RESET_TOKEN) return renderReset(RESET_TOKEN);
  if (!USER) return renderLogin();
  $('#header').classList.remove('oculto');
  $('#footer').classList.remove('oculto');
  renderNavSolo();
  if (VISTA === 'pedir') renderWizard();
  else if (VISTA === 'misturnos') renderMisTurnos();
  else if (VISTA === 'agenda') renderAgenda();
  else if (VISTA === 'clientes') renderClientes();
  else if (VISTA === 'maestros') renderMaestros();
  else if (VISTA === 'config') renderConfig();
}

function renderNavSolo() {
  const sinLeer = NOTIS.filter(n => !n.leida).length;
  let botones = '';
  if (USER.rol === 'cliente') {
    botones = `
      <button class="${VISTA === 'pedir' ? 'activo' : ''}" onclick="irA('pedir')">Pedir turno</button>
      <button class="${VISTA === 'misturnos' ? 'activo' : ''}" onclick="irA('misturnos')">Mis turnos</button>
      <button class="btn-campana" onclick="abrirNotis()" title="Novedades">🔔${sinLeer ? `<span class="punto">${sinLeer}</span>` : ''}</button>`;
  } else if (USER.rol === 'coordinador') {
    botones = `
      <button class="${VISTA === 'agenda' ? 'activo' : ''}" onclick="irA('agenda')">Agenda</button>
      <button class="${VISTA === 'clientes' ? 'activo' : ''}" onclick="irA('clientes')">Clientes</button>
      <button class="${VISTA === 'maestros' ? 'activo' : ''}" onclick="irA('maestros')">Maestros</button>`;
  } else {
    botones = `
      <button class="${VISTA === 'agenda' ? 'activo' : ''}" onclick="irA('agenda')">Agenda</button>
      <button class="${VISTA === 'clientes' ? 'activo' : ''}" onclick="irA('clientes')">Clientes</button>
      <button class="${VISTA === 'maestros' ? 'activo' : ''}" onclick="irA('maestros')">Maestros</button>
      <button class="${VISTA === 'config' ? 'activo' : ''}" onclick="irA('config')">Configuración</button>`;
  }
  $('#nav').innerHTML = `${botones}
    <span class="usuario-chip">
      <span class="rol-tag">${USER.rol}</span>
      <span>${esc(USER.nombre)}${USER.clienteNombre ? ` · ${esc(USER.clienteNombre)}` : ''}</span>
      <button class="btn btn-gris btn-chico" onclick="abrirCambioPassword()" title="Cambiar mi contraseña">🔑</button>
      <button class="btn btn-gris btn-chico" onclick="logout()">Salir</button>
    </span>`;
}

function irA(v) { VISTA = v; render(); }

/* ============================================================
   CLIENTE — Wizard de solicitud
   ============================================================ */

const PASOS = ['Aeronave', 'Fecha', 'Horario', 'Datos del turno', 'Confirmación'];

async function renderWizard() {
  const chips = PASOS.map((p, i) => {
    const n = i + 1;
    const cls = n === W.paso ? 'actual' : (n < W.paso ? 'hecho' : '');
    return `<div class="paso-chip ${cls}">${n}. ${p}</div>`;
  }).join('');

  let cuerpo = '';
  if (W.paso === 1) cuerpo = await pasoAeronave();
  else if (W.paso === 2) cuerpo = pasoFecha();
  else if (W.paso === 3) cuerpo = await pasoHora();
  else if (W.paso === 4) cuerpo = await pasoDatos();
  else cuerpo = pasoConfirmacion();

  $('#main').innerHTML = `
    <h2 class="titulo-seccion">Solicitud de turno de abastecimiento</h2>
    <p class="subtitulo">Aeroplanta San Fernando (SADF) · Primero elegís la aeronave (define el grado); la disponibilidad de horarios se calcula según las abastecedoras de ese grado. El turno queda <strong>pendiente</strong> hasta que el coordinador asigne abastecedora y operador.</p>
    <div class="pasos">${chips}</div>
    <div class="panel">${cuerpo}</div>`;
}

function wizardPaso(n) { W.paso = n; render(); }

/* ---------- Paso 1: aeronave (define el grado) ---------- */
async function pasoAeronave() {
  let aeronaves = [];
  try { aeronaves = await api('/api/aeronaves'); } catch (e) { return `<div class="alerta roja">${esc(e.message)}</div>`; }
  W.misAeronaves = aeronaves;

  if (W.esNueva) {
    return `<h3 style="margin-bottom:14px">Primera carga — registro de aeronave</h3>${formNuevaAeronave()}`;
  }

  const tarjetas = aeronaves.map(a => `
    <div class="card-aeronave" style="cursor:pointer;${W.aeronave?.matricula === a.matricula ? 'border-color:var(--azul);background:var(--azul-suave)' : ''}"
         onclick="elegirAeronave('${esc(a.matricula)}')">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <div class="mat">✈ ${esc(a.matricula)}</div>
          <div class="dato">${esc(a.tipo)} · Motor: ${MOTORES[a.motor].nombre}</div>
          <div class="dato">Capacidad: ${a.capacidad} L ${a.excepcion_grado ? '· ⚠ excepción de grado autorizada' : ''}</div>
        </div>
        ${badgeGrado(a.grado, true)}
      </div>
    </div>`).join('');

  return `<h3 style="margin-bottom:4px">Elegí la aeronave a abastecer:</h3>
    <p class="subtitulo">Solo ves las matrículas asociadas a ${esc(USER.clienteNombre || 'tu cliente')}. El grado de combustible está <strong>bloqueado</strong> por el maestro; solo el administrador de la planta puede cambiarlo.</p>
    ${tarjetas || '<p class="subtitulo">Todavía no tenés aeronaves registradas.</p>'}
    <div class="botonera">
      <button class="btn btn-verde" ${W.aeronave ? '' : 'disabled'} onclick="wizardPaso(2)">
        Continuar${W.aeronave ? ` con ${esc(W.aeronave.matricula)}` : ''}</button>
      <button class="btn btn-gris" onclick="W.esNueva=true;render()">➕ Primera carga: registrar aeronave nueva</button>
    </div>`;
}

function elegirAeronave(mat) {
  W.aeronave = W.misAeronaves.find(a => a.matricula === mat) || null;
  W.matricula = mat;
  W.fecha = null; W.hora = null; // el grado cambió: se recalcula disponibilidad
  render();
}

/* ---------- Paso 2: fecha ---------- */
function pasoFecha() {
  const diasMax = Number(CONFIG.dias_anticipacion) || 14;
  const hoy = new Date();
  const dias = [];
  for (let i = 0; i < diasMax; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nd = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'][d.getDay()];
    dias.push(`<div class="slot ${W.fecha === iso ? 'elegido' : ''}" onclick="W.fecha='${iso}';W.hora=null;render()">
      ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}<small>${nd}</small></div>`);
  }
  return `<h3 style="margin-bottom:4px">Elegí la fecha del turno:</h3>
    <p class="subtitulo">Aeronave ${esc(W.aeronave.matricula)} · ${badgeGrado(W.aeronave.grado)}</p>
    <div class="grilla-slots">${dias.join('')}</div>
    <div class="botonera">
      <button class="btn btn-verde" ${W.fecha ? '' : 'disabled'} onclick="wizardPaso(3)">Continuar</button>
      <button class="btn btn-blanco" onclick="wizardPaso(1)">Volver a la aeronave</button>
    </div>`;
}

/* ---------- Paso 3: horario (disponibilidad según abastecedoras del grado) ---------- */
async function pasoHora() {
  const grado = W.aeronave.grado;
  let data;
  try { data = await api(`/api/turnos/slots?fecha=${W.fecha}&grado=${encodeURIComponent(grado)}`); }
  catch (e) { return `<div class="alerta roja">${esc(e.message)}</div>`; }
  W.capacidad = data.capacidad;
  const slots = data.slots.map(s => {
    const cls = s.lleno ? 'lleno' : (W.hora === s.hora ? 'elegido' : '');
    let sub;
    if (s.lleno) sub = s.motivoLleno === 'recurso' ? `Sin ${grado === 'JET A-1' ? 'JET' : 'AVGAS'}` : 'Completo';
    else sub = `${s.libres} libre${s.libres > 1 ? 's' : ''}`;
    return `<div class="slot ${cls}" ${s.lleno ? '' : `onclick="W.hora='${s.hora}';render()"`}>
      ${s.hora}<small>${sub}</small></div>`;
  }).join('');
  return `<h3 style="margin-bottom:4px">Elegí el horario:</h3>
    <p class="subtitulo">${fechaLegible(W.fecha)} · ${badgeGrado(grado)} · <strong>${data.recursoGrado}</strong> abastecedora(s) de este grado en la planta. Los horarios "Sin ${grado === 'JET A-1' ? 'JET' : 'AVGAS'}" no tienen equipo disponible aunque haya lugar en la grilla.</p>
    <div class="grilla-slots">${slots}</div>
    <div class="botonera">
      <button class="btn btn-verde" ${W.hora ? '' : 'disabled'} onclick="wizardPaso(4)">Continuar</button>
      <button class="btn btn-blanco" onclick="wizardPaso(2)">Elegir otra fecha</button>
    </div>`;
}

function formNuevaAeronave() {
  const n = W.nueva;
  const hangares = (W.hangares || []).map(h =>
    `<option value="${h.codigo}" ${n.hangar === h.codigo ? 'selected' : ''}>(${h.codigo}) ${esc(h.nombre)}</option>`).join('');
  if (!W.hangares) {
    api('/api/hangares').then(h => { W.hangares = h; render(); });
  }
  const gradoSugerido = n.motor ? MOTORES[n.motor].gradoEsperado : null;
  const incoherente = n.motor && n.grado && n.grado !== gradoSugerido;

  return `
    <div class="alerta azul">✈ La aeronave quedará asociada a <strong>${esc(USER.clienteNombre)}</strong> y su grado de combustible quedará <strong>bloqueado</strong>: después del alta solo el administrador puede modificarlo.</div>
    <div class="fila-form">
      <label>Matrícula:<small>Escribila SIN guión: el sistema lo coloca. Ej.: LVABC o N123AB</small></label>
      <div class="campo"><input type="text" id="wz-matricula" value="${esc(n.matricula || '')}" placeholder="LVABC"
        onchange="W.nueva.matricula=this.value;verificarMatriculaUI()"></div>
    </div>
    ${bloqueVerificacion()}
    <div class="fila-form">
      <label>Tipo de aeronave:<small>Ej.: Cessna 172, King Air B200</small></label>
      <div class="campo"><input type="text" value="${esc(n.tipo)}" onchange="W.nueva.tipo=this.value"></div>
    </div>
    <div class="fila-form">
      <label>Tipo de motor:<small>Determina el grado esperado</small></label>
      <div class="campo"><select onchange="W.nueva.motor=this.value;render()">
        <option value=""></option>
        ${Object.entries(MOTORES).map(([k, v]) => `<option value="${k}" ${n.motor === k ? 'selected' : ''}>${v.nombre}</option>`).join('')}
      </select></div>
    </div>
    <div class="fila-form">
      <label>Grado de combustible:</label>
      <div class="campo"><select onchange="W.nueva.grado=this.value;render()">
        <option value=""></option>
        ${GRADOS.map(g => `<option value="${g}" ${n.grado === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select></div>
    </div>
    ${n.motor && !n.grado ? `<div class="alerta azul">💡 Para motor <strong>${MOTORES[n.motor].nombre}</strong> el grado esperado es <strong>${gradoSugerido}</strong>.</div>` : ''}
    ${incoherente ? `
      <div class="alerta roja">🚨 <strong>ALERTA ANTI-MISFUELLING — incoherencia motor / grado.</strong><br>
      Para un motor ${MOTORES[n.motor].nombre.toLowerCase()} el grado esperado es <strong>${gradoSugerido}</strong>.
      ${n.motor === 'PISTON' && n.grado === 'JET A-1'
        ? 'Cargar JET A-1 en un pistón convencional causa detonación y falla de motor en vuelo. Solo es válido en motores diésel aeronáuticos certificados (ej. DA-42).'
        : 'Cargar AVGAS en una turbina está prohibido salvo indicación del fabricante.'}
      <br><br>Si es una excepción real, escribí el grado exacto para confirmar:
      <div style="margin-top:8px"><input type="text" id="wz-conf-excepcion" placeholder="Escribí: ${esc(n.grado)}" style="max-width:280px"></div>
      </div>` : ''}
    <div class="fila-form">
      <label>Capacidad de combustible (L):</label>
      <div class="campo"><input type="number" min="1" value="${esc(n.capacidad)}" onchange="W.nueva.capacidad=this.value"></div>
    </div>
    <div class="fila-form">
      <label>Hangar / plataforma habitual:</label>
      <div class="campo"><select onchange="W.nueva.hangar=this.value"><option value=""></option>${hangares}</select></div>
    </div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="guardarAeronaveNueva()">Registrar aeronave</button>
      <button class="btn btn-blanco" onclick="W.esNueva=false;render()">Cancelar</button>
    </div>`;
}

/* ---------- Verificación de matrícula (formato + registro externo) ---------- */

function bloqueVerificacion() {
  const v = W.verif;
  if (!v) return '';
  if (v.formato_valido === false) {
    return `<div class="alerta roja">✋ ${esc(v.error_formato)}</div>`;
  }
  let html = `<div class="alerta verde" style="margin-top:0">🔎 Matrícula normalizada: <strong style="font-size:16px">${esc(v.matricula)}</strong> · ${esc(v.pais)}</div>`;
  if (v.ya_registrada) {
    html += `<div class="alerta roja">🚫 <strong>${esc(v.matricula)} ya está registrada</strong>${v.propia ? ' en tu cuenta: seleccionala de la lista en lugar de darla de alta de nuevo.' : ' en otro cliente del maestro (las matrículas son únicas). Si es tu aeronave, contactá al coordinador de planta.'}</div>`;
  }
  if (v.parecidas?.length) {
    html += `<div class="alerta amarilla">⚠ <strong>Matrículas parecidas ya registradas:</strong> ${v.parecidas.map(esc).join(', ')}. Verificá que no sea un error de tipeo.</div>`;
  }
  const r = v.verificacion;
  if (r === null) {
    html += `<div class="alerta azul">ℹ El servicio externo de verificación no está disponible en este momento: se validó solo el formato. Confirmá los datos con la documentación de la aeronave.</div>`;
  } else if (r.encontrada) {
    const contraMotor = r.sugerencia_motor && W.nueva.motor && r.sugerencia_motor !== W.nueva.motor;
    html += `<div class="alerta verde">✔ <strong>Encontrada en el registro público ADS-B:</strong>
      ${esc(r.fabricante || '')} ${esc(r.tipo || '')}${r.operador ? ` · Operador: ${esc(r.operador)}` : ''}${r.pais ? ` · ${esc(r.pais)}` : ''}.
      Verificá que coincida con tu aeronave.</div>`;
    if (contraMotor) {
      html += `<div class="alerta roja">🚨 <strong>ALERTA ANTI-MISFUELLING:</strong> según el registro externo, ${esc(v.matricula)} es un <strong>${esc(r.tipo)}</strong>, que corresponde a motor <strong>${r.sugerencia_motor === 'TURBINA' ? 'de turbina (JET A-1)' : 'a pistón (AVGAS 100LL)'}</strong>, pero seleccionaste "${MOTORES[W.nueva.motor].nombre}". Revisá el tipo de motor antes de continuar.</div>`;
    }
  } else {
    html += `<div class="alerta azul">ℹ No figura en la base pública ADS-B (habitual en aviación general sin transpondedor Mode-S). Esto <strong>no invalida</strong> la matrícula: verificá los datos contra la documentación de la aeronave.</div>`;
  }
  return html;
}

async function verificarMatriculaUI() {
  const valor = ($('#wz-matricula') ? $('#wz-matricula').value : W.nueva.matricula) || '';
  if (!valor.trim()) { W.verif = null; return; }
  try {
    W.verif = await api(`/api/aeronaves/verificar/${encodeURIComponent(valor.trim())}`);
    if (W.verif.formato_valido) {
      W.nueva.matricula = W.verif.matricula;
      if (W.verif.verificacion?.encontrada && !W.nueva.tipo) {
        W.nueva.tipo = `${W.verif.verificacion.fabricante || ''} ${W.verif.verificacion.tipo || ''}`.trim();
      }
    }
  } catch { W.verif = null; }
  render();
}

async function guardarAeronaveNueva() {
  const n = W.nueva;
  if (W.verif && W.verif.formato_valido === false) {
    return alertaModal('Matrícula inválida', W.verif.error_formato);
  }
  if (W.verif?.ya_registrada) {
    return alertaModal('Matrícula ya registrada',
      W.verif.propia
        ? `${W.verif.matricula} ya está en tu cuenta: volvé atrás y seleccionala de la lista.`
        : `${W.verif.matricula} ya pertenece a otro cliente del maestro. Contactá al coordinador de planta.`);
  }
  try {
    const r = await api('/api/aeronaves', 'POST', {
      matricula: $('#wz-matricula').value, tipo: n.tipo, motor: n.motor, grado: n.grado,
      capacidad: n.capacidad, hangar: n.hangar,
      confirmacion_excepcion: $('#wz-conf-excepcion') ? $('#wz-conf-excepcion').value : '',
    });
    W.esNueva = false;
    W.nueva = { tipo: '', motor: '', grado: '', hangar: '', capacidad: '' };
    const lista = await api('/api/aeronaves');
    W.misAeronaves = lista;
    W.aeronave = lista.find(a => a.matricula === r.matricula) || null;
    render();
    if (r.parecidas?.length) {
      alertaModal('Aeronave registrada — verificá la matrícula',
        `Se registró ${r.matricula}. ⚠ Existen matrículas parecidas en el sistema (${r.parecidas.join(', ')}): confirmá que no sea un error de tipeo.`);
    }
  } catch (e) { errorModal(e); }
}

async function pasoDatos() {
  const a = W.aeronave;
  if (!W.hangar) {
    if (!W.hangares) W.hangares = await api('/api/hangares').catch(() => []);
    W.hangar = a.hangar;
  }
  const hangares = (W.hangares || []).map(h =>
    `<option value="${h.codigo}" ${W.hangar === h.codigo ? 'selected' : ''}>(${h.codigo}) ${esc(h.nombre)}</option>`).join('');
  const pagos = FORMAS_PAGO.map(p => `<option value="${p}" ${W.formaPago === p ? 'selected' : ''}>${p}</option>`).join('');
  const vol = Number(W.volumen);
  const excede = vol > 0 && vol > a.capacidad;

  return `<h3 style="margin-bottom:14px">Complete la siguiente información:</h3>
    ${bannerGrado(a.grado, `Grado bloqueado por el maestro para ${a.matricula} (${a.tipo})`)}
    <div class="fila-form">
      <label>Volumen aproximado obligatorio:<small>En litros</small></label>
      <div class="campo ${W.volumen === '' ? '' : (vol > 0 ? 'valido' : 'invalido')}">
        <input type="number" min="1" value="${esc(W.volumen)}" onchange="W.volumen=this.value;render()">
        <span class="icono-estado"></span>
      </div>
    </div>
    ${excede ? `<div class="alerta amarilla">⚠ El volumen pedido (${vol} L) <strong>supera la capacidad registrada</strong> de ${esc(a.matricula)} (${a.capacidad} L). Verificá el dato: un volumen anómalo puede indicar una <strong>aeronave equivocada</strong>.</div>` : ''}
    <div class="fila-form">
      <label>Forma de Pago:</label>
      <div class="campo ${W.formaPago ? 'valido' : ''}">
        <select onchange="W.formaPago=this.value;render()"><option value=""></option>${pagos}</select>
        <span class="icono-estado"></span>
      </div>
    </div>
    <div class="fila-form">
      <label>Matrícula:</label>
      <div class="campo valido"><input type="text" value="${esc(a.matricula)}" disabled><span class="icono-estado"></span></div>
    </div>
    <div class="fila-form">
      <label>Cliente:</label>
      <div class="campo valido"><input type="text" value="${esc(USER.clienteNombre)}" disabled><span class="icono-estado"></span></div>
    </div>
    <div class="fila-form">
      <label>Hangar San Fernando:<small>Dónde está la aeronave</small></label>
      <div class="campo ${W.hangar ? 'valido' : ''}">
        <select onchange="W.hangar=this.value;render()">${hangares}</select>
        <span class="icono-estado"></span>
      </div>
    </div>
    <div class="fila-form">
      <label>Motivo:<small>Comentario adicional que quiera agregar al turno</small></label>
      <div class="campo"><textarea onchange="W.motivo=this.value">${esc(W.motivo)}</textarea></div>
    </div>
    <div class="botonera">
      <button class="btn btn-verde" ${vol > 0 && W.formaPago && W.hangar ? '' : 'disabled'} onclick="wizardPaso(5)">Continuar</button>
      <button class="btn btn-blanco" onclick="wizardPaso(3)">Cambiar horario</button>
    </div>`;
}

function pasoConfirmacion() {
  const a = W.aeronave;
  const hangarSel = (W.hangares || []).find(h => h.codigo === W.hangar);
  return `<h3 style="margin-bottom:6px">Confirmación del turno — verificación final de combustible</h3>
    <p class="subtitulo">Última barrera antes de enviar el pedido a la planta. Leé con atención.</p>
    <div class="resumen">
      <div class="fila"><div>Fecha y hora</div><div><strong>${fechaLegible(W.fecha)} · ${W.hora} hs</strong></div></div>
      <div class="fila"><div>Matrícula</div><div><strong>${esc(a.matricula)}</strong> — ${esc(a.tipo)}</div></div>
      <div class="fila"><div>Motor</div><div>${MOTORES[a.motor].nombre}</div></div>
      <div class="fila"><div>Volumen aproximado</div><div>${esc(W.volumen)} L</div></div>
      <div class="fila"><div>Forma de pago</div><div>${esc(W.formaPago)}</div></div>
      <div class="fila"><div>Cliente</div><div>${esc(USER.clienteNombre)}</div></div>
      <div class="fila"><div>Hangar / plataforma</div><div>${hangarSel ? `(${hangarSel.codigo}) ${esc(hangarSel.nombre)}` : esc(W.hangar)}</div></div>
      ${W.motivo ? `<div class="fila"><div>Motivo</div><div>${esc(W.motivo)}</div></div>` : ''}
    </div>
    ${bannerGrado(a.grado, `Se cargará ${a.grado} a la aeronave ${a.matricula}`)}
    <label class="check-item" onclick="toggleCheck(this)">
      <input type="checkbox" id="chk-grado">
      <span class="texto">Confirmo que la aeronave <strong>${esc(a.matricula)}</strong> (${esc(a.tipo)}, motor ${MOTORES[a.motor].nombre.toLowerCase()}) requiere <strong>${esc(a.grado)}</strong> y que el placard junto a las bocas de carga indica ese grado.</span>
    </label>
    <label class="check-item" onclick="toggleCheck(this)">
      <input type="checkbox" id="chk-datos">
      <span class="texto">Revisé la fecha, el horario, el volumen y el hangar, y son correctos.</span>
    </label>
    <div class="fila-form" style="margin-top:14px">
      <label>Confirmación positiva:<small>Escribí la matrícula para confirmar (con o sin guión)</small></label>
      <div class="campo"><input type="text" id="conf-matricula" placeholder="${esc(a.matricula)}" autocomplete="off"></div>
    </div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="confirmarTurno()">Confirmar turno</button>
      <button class="btn btn-blanco" onclick="wizardPaso(4)">Volver a los datos</button>
    </div>`;
}

function toggleCheck(wrap) {
  const cb = wrap.querySelector('input');
  setTimeout(() => wrap.classList.toggle('ok', cb.checked), 0);
}

async function confirmarTurno() {
  if (!$('#chk-grado').checked || !$('#chk-datos').checked) {
    return alertaModal('Falta confirmar', 'Tenés que marcar las dos verificaciones antes de confirmar el turno.');
  }
  const alnum = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const escrito = $('#conf-matricula').value;
  if (alnum(escrito) !== alnum(W.aeronave.matricula)) {
    return alertaModal('Matrícula no coincide',
      `Escribiste "${normMat(escrito) || '(vacío)'}" pero el turno es para ${W.aeronave.matricula}. La confirmación positiva evita cargas a la aeronave equivocada. Podés escribirla con o sin guión, pero los caracteres deben coincidir.`);
  }
  try {
    const r = await api('/api/turnos', 'POST', {
      fecha: W.fecha, hora: W.hora, matricula: W.aeronave.matricula,
      volumen: W.volumen, forma_pago: W.formaPago, hangar: W.hangar, motivo: W.motivo,
      confirmacion_matricula: escrito,
    });
    wizardNuevo();
    VISTA = 'misturnos';
    render();
    alertaModal('✅ Turno solicitado',
      `Tu turno ${r.codigo} quedó PENDIENTE. Cuando el coordinador asigne la abastecedora y el operador vas a ver la confirmación acá y en la campanita 🔔.`);
  } catch (e) { errorModal(e); }
}

/* ============================================================
   CLIENTE — Mis turnos + notificaciones
   ============================================================ */

async function renderMisTurnos() {
  let turnos = [];
  try { turnos = await api('/api/turnos'); } catch (e) { return errorModal(e); }
  cargarNotis();

  const cards = turnos.map(t => {
    let detalleEstado = '';
    if (t.estado === 'PENDIENTE') {
      detalleEstado = `<div class="alerta amarilla" style="margin:10px 0 0">⏳ Esperando que el coordinador de planta asigne abastecedora y operador.</div>`;
    } else if (t.estado === 'PROGRAMADO') {
      detalleEstado = `<div class="alerta verde" style="margin:10px 0 0">✅ <strong>Turno programado.</strong> Abastecedora <strong>${esc(t.abastecedora)}</strong> · Operador <strong>${esc(t.operador || '—')}</strong>.
        ${t.comentario_coordinador ? `<br>💬 Coordinador: "${esc(t.comentario_coordinador)}"` : ''}</div>`;
    } else if (t.estado === 'ABASTECIDO') {
      detalleEstado = `<div class="alerta verde" style="margin:10px 0 0">⛽ <strong>Abastecido.</strong> La carga quedó registrada.</div>`;
    } else if (t.estado === 'AUSENTE') {
      detalleEstado = `<div class="alerta amarilla" style="margin:10px 0 0">⚠ <strong>No se presentó.</strong> Si necesitás cargar, solicitá un nuevo turno.</div>`;
    } else {
      detalleEstado = `<div class="alerta roja" style="margin:10px 0 0">❌ <strong>Cancelado.</strong> ${esc(t.motivo_cancelacion || '')}</div>`;
    }
    const cancelable = ['PENDIENTE', 'PROGRAMADO'].includes(t.estado) && t.fecha >= hoyISO();
    return `<div class="turno-card">
      <div class="encabezado">
        <span class="hora">${t.fecha} · ${t.hora}</span>
        ${badgeGrado(t.grado)}
        <strong style="font-size:16px">${esc(t.matricula)}</strong>
        <span style="color:var(--texto-suave)">${esc(t.tipo_aeronave)}</span>
        ${badgeEstado(t.estado)}
        <span style="margin-left:auto;color:var(--texto-suave);font-size:12px">${t.codigo}</span>
      </div>
      <div class="datos">${t.volumen} L aprox. · ${esc(t.forma_pago)} · Hangar: ${esc(t.hangar)}${t.motivo ? ` · 📝 ${esc(t.motivo)}` : ''}</div>
      ${detalleEstado}
      ${cancelable ? `<div class="acciones"><button class="btn btn-blanco btn-chico" onclick="abrirCancelar('${t.id}','${t.codigo}')">Cancelar turno</button></div>` : ''}
    </div>`;
  }).join('');

  $('#main').innerHTML = `
    <h2 class="titulo-seccion">Mis turnos</h2>
    <p class="subtitulo">${esc(USER.clienteNombre)} · Acá ves el estado de cada pedido y la asignación de la planta.</p>
    <div class="panel">${cards || '<p class="subtitulo" style="margin:0">Todavía no pediste turnos.</p>'}</div>`;
}

function abrirNotis() {
  const items = NOTIS.map(n => `
    <div class="noti-item ${n.leida ? '' : 'nueva'}">
      ${esc(n.mensaje)}
      <small>${new Date(n.creada).toLocaleString('es-AR')}</small>
    </div>`).join('');
  modal(`<h3>🔔 Novedades de tus turnos</h3>
    ${items || '<p class="subtitulo">No hay novedades.</p>'}
    <div class="botonera"><button class="btn btn-verde" onclick="marcarLeidas()">Entendido</button></div>`);
}

async function marcarLeidas() {
  try { await api('/api/notificaciones/leidas', 'PUT', {}); NOTIS.forEach(n => n.leida = 1); } catch {}
  cerrarModal();
  renderNavSolo();
}

function abrirCancelar(id, codigo) {
  modal(`<h3>Cancelar turno ${esc(codigo)}</h3>
    <div class="fila-form"><label>Motivo de la cancelación:</label>
      <div class="campo"><textarea id="cancel-motivo" placeholder="Obligatorio"></textarea></div></div>
    <div class="botonera">
      <button class="btn btn-blanco" onclick="enviarCancelar('${id}')">Cancelar el turno</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Volver</button>
    </div>`);
}

async function enviarCancelar(id) {
  try {
    await api(`/api/turnos/${id}/cancelar`, 'PUT', { motivo: $('#cancel-motivo').value });
    cerrarModal(); render();
  } catch (e) { errorModal(e); }
}

/* ============================================================
   COORDINADOR / ADMIN — Agenda
   ============================================================ */

async function renderAgenda() {
  if (!FILTRO_FECHA) FILTRO_FECHA = hoyISO();
  let turnos = [], abastecedoras = [], operadores = [];
  try {
    [turnos, abastecedoras, operadores] = await Promise.all([
      api(`/api/turnos?fecha=${FILTRO_FECHA}`),
      api('/api/abastecedoras'),
      api('/api/operadores'),
    ]);
  } catch (e) { return errorModal(e); }
  const pendientes = turnos.filter(t => t.estado === 'PENDIENTE');
  const programados = turnos.filter(t => t.estado === 'PROGRAMADO');
  const finalizados = turnos.filter(t => ['ABASTECIDO', 'AUSENTE'].includes(t.estado));
  const cancelados = turnos.filter(t => t.estado === 'CANCELADO');

  const tags = (t) => `${t.sobreturno
    ? '<span class="rol-tag" style="background:#ffedd5;color:#9a3412;border-color:#9a3412">SOBRETURNO</span>'
    : (t.origen === 'MANUAL' ? '<span class="rol-tag">MANUAL</span>' : '')}`;

  const cardPend = (t) => {
    const ops = abastecedoras.filter(ab => ab.activa).map(ab => {
      const compatible = ab.grado === t.grado;
      const ocupada = programados.some(x => x.abastecedora === ab.id && x.hora === t.hora && x.id !== t.id);
      let txt = `${ab.id} — ${ab.grado} (${ab.capacidad} L)`;
      if (!compatible) txt = `🚫 ${ab.id} — ${ab.grado} — GRADO INCOMPATIBLE`;
      else if (ocupada) txt = `⏱ ${ab.id} — ocupada en este horario`;
      else if (ab.capacidad < t.volumen) txt = `⚠ ${ab.id} — ${ab.grado} (capacidad ${ab.capacidad} L < pedido)`;
      return `<option value="${ab.id}" ${compatible && !ocupada ? '' : 'disabled'}>${txt}</option>`;
    }).join('');
    const opOper = operadores.filter(o => o.activo).map(o => `<option value="${o.id}">${esc(o.nombre)}</option>`).join('');
    return `<div class="turno-card">
      <div class="encabezado">
        <span class="hora">${t.hora}</span>
        ${badgeGrado(t.grado)}
        <strong style="font-size:16px">${esc(t.matricula)}</strong>
        <span style="color:var(--texto-suave)">${esc(t.tipo_aeronave)}</span>
        ${badgeEstado(t.estado)}${tags(t)}
        <span style="margin-left:auto;color:var(--texto-suave);font-size:12px">${t.codigo}</span>
      </div>
      <div class="datos">${t.volumen} L aprox. · ${esc(t.forma_pago)} · Cliente: ${esc(t.cliente)} · Hangar: ${esc(t.hangar)}${t.motivo ? `<br>📝 ${esc(t.motivo)}` : ''}</div>
      <div class="acciones">
        <select id="ab-${t.id}" style="max-width:340px"><option value="">— Abastecedora (solo ${esc(t.grado)}) —</option>${ops}</select>
        <select id="op-${t.id}" style="max-width:220px"><option value="">— Operador —</option>${opOper}</select>
        <button class="btn btn-verde btn-chico" onclick="asignar('${t.id}')">Asignar y programar</button>
        <button class="btn btn-gris btn-chico" onclick="abrirReprogramar('${t.id}','${t.codigo}','${t.fecha}','${t.hora}','${t.grado}')">Cambiar horario</button>
        <button class="btn btn-blanco btn-chico" onclick="abrirCancelar('${t.id}','${t.codigo}')">Cancelar</button>
      </div>
    </div>`;
  };

  const cardProg = (t) => `<div class="turno-card">
    <div class="encabezado">
      <span class="hora">${t.hora}</span>
      ${badgeGrado(t.grado)}
      <strong style="font-size:16px">${esc(t.matricula)}</strong>
      <span style="color:var(--texto-suave)">${esc(t.tipo_aeronave)}</span>
      ${badgeEstado(t.estado)}${tags(t)}
      <span style="margin-left:auto;color:var(--texto-suave);font-size:12px">${t.codigo}</span>
    </div>
    <div class="datos">
      🚛 <strong>${esc(t.abastecedora)}</strong> · 👷 <strong>${esc(t.operador || '—')}</strong> ·
      ${t.volumen} L · ${esc(t.cliente)} · Hangar: ${esc(t.hangar)}
      ${t.comentario_coordinador ? `<br>💬 ${esc(t.comentario_coordinador)}` : ''}
    </div>
    <div class="acciones">
      <button class="btn btn-verde btn-chico" onclick="confirmarAbastecimiento('${t.id}','${t.codigo}','ABASTECIDO')">✅ Abastecido</button>
      <button class="btn btn-blanco btn-chico" onclick="confirmarAbastecimiento('${t.id}','${t.codigo}','AUSENTE')">🚫 No se presentó</button>
      <button class="btn btn-gris btn-chico" onclick="abrirReprogramar('${t.id}','${t.codigo}','${t.fecha}','${t.hora}','${t.grado}')">Cambiar horario</button>
      <button class="btn btn-gris btn-chico" onclick="abrirCancelar('${t.id}','${t.codigo}')">Cancelar</button>
    </div>
  </div>`;

  const cardFin = (t) => `<div class="turno-card" style="border-left-color:${ESTADOS[t.estado].color}">
    <div class="encabezado">
      <span class="hora">${t.hora}</span>${badgeGrado(t.grado)}
      <strong>${esc(t.matricula)}</strong>${badgeEstado(t.estado)}${tags(t)}
      <span style="margin-left:auto;color:var(--texto-suave);font-size:12px">${t.codigo}</span>
    </div>
    <div class="datos">🚛 ${esc(t.abastecedora || '—')} · ${t.volumen} L · ${esc(t.cliente)} · Hangar: ${esc(t.hangar)}
      ${t.comentario_coordinador ? `<br>💬 ${esc(t.comentario_coordinador)}` : ''}</div>
  </div>`;

  $('#main').innerHTML = `
    <h2 class="titulo-seccion">Agenda de planta</h2>
    <p class="subtitulo">Asigná abastecedora y operador a cada pedido, y confirmá el resultado (abastecido / no se presentó). Los turnos programados de días pasados que no se gestionen se asumen <strong>abastecidos</strong> al cierre.</p>
    <div class="panel" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <label style="font-weight:700;font-size:14px">Fecha:</label>
      <input type="date" style="max-width:190px" value="${FILTRO_FECHA}" onchange="FILTRO_FECHA=this.value;render()">
      <span style="color:var(--texto-suave);font-size:13.5px">${fechaLegible(FILTRO_FECHA)} · ${turnos.length} turno(s)</span>
      <button class="btn btn-verde btn-chico" style="margin-left:auto" onclick="abrirTurnoManual()">➕ Turno manual (teléfono / mostrador)</button>
    </div>
    <div class="panel">
      <h3 style="margin-bottom:12px">📥 Pendientes de asignación (${pendientes.length})</h3>
      ${pendientes.map(cardPend).join('') || '<p class="subtitulo" style="margin:0">No hay pedidos pendientes.</p>'}
    </div>
    <div class="panel">
      <h3 style="margin-bottom:12px">🗓 Programados (${programados.length})</h3>
      ${programados.map(cardProg).join('') || '<p class="subtitulo" style="margin:0">No hay turnos programados.</p>'}
    </div>
    ${finalizados.length ? `<div class="panel">
      <h3 style="margin-bottom:12px">✔ Finalizados del día (${finalizados.length})</h3>
      ${finalizados.map(cardFin).join('')}
    </div>` : ''}
    ${cancelados.length ? `<div class="panel">
      <h3 style="margin-bottom:12px">❌ Cancelados (${cancelados.length})</h3>
      ${cancelados.map(t => `<div class="turno-card"><div class="encabezado">
        <span class="hora">${t.hora}</span>${badgeGrado(t.grado)}<strong>${esc(t.matricula)}</strong>${badgeEstado(t.estado)}${tags(t)}
        <span style="margin-left:auto;color:var(--texto-suave);font-size:12px">${t.codigo}</span></div>
        <div class="datos">${esc(t.cliente)} · ${esc(t.motivo_cancelacion || '')}</div></div>`).join('')}
    </div>` : ''}`;
}

async function confirmarAbastecimiento(id, codigo, resultado) {
  const texto = resultado === 'ABASTECIDO'
    ? `¿Confirmás que el turno ${codigo} se ABASTECIÓ?`
    : `¿Marcar el turno ${codigo} como NO SE PRESENTÓ? Se le avisará al cliente.`;
  confirmarModal(resultado === 'ABASTECIDO' ? 'Confirmar abastecimiento' : 'Marcar ausente', texto, async () => {
    try { await api(`/api/turnos/${id}/abastecimiento`, 'PUT', { resultado }); render(); }
    catch (e) { errorModal(e); }
  });
}

/* ---------- Turno manual (coordinador): teléfono / mostrador, con sobreturno opcional ---------- */
async function abrirTurnoManual() {
  let aeronaves = [], hangares = [];
  try { [aeronaves, hangares] = await Promise.all([api('/api/aeronaves'), api('/api/hangares')]); }
  catch (e) { return errorModal(e); }
  const optAero = aeronaves.map(a => `<option value="${esc(a.matricula)}" data-grado="${a.grado}">${esc(a.matricula)} — ${esc(a.tipo)} (${a.grado})</option>`).join('');
  const optHan = hangares.map(h => `<option value="${h.codigo}">(${h.codigo}) ${esc(h.nombre)}</option>`).join('');
  const optPago = FORMAS_PAGO.map(p => `<option>${p}</option>`).join('');
  const hoy = hoyISO();
  modal(`<h3>➕ Turno manual</h3>
    <div class="alerta azul">Para cargar un pedido recibido por teléfono o en el mostrador. Si marcás <strong>sobreturno</strong>, el turno no consume la capacidad ni el recurso de los turnos ya asignados.</div>
    <div class="fila-form"><label>Aeronave (matrícula):</label>
      <div class="campo"><select id="tm-matricula" onchange="tmActualizarGrado()">${optAero}</select></div></div>
    <div id="tm-grado-info"></div>
    <div class="fila-form"><label>Fecha:</label><div class="campo"><input type="date" id="tm-fecha" value="${hoy}" min="${hoy}" onchange="tmCargarHoras()"></div></div>
    <div class="fila-form"><label>Horario:</label><div class="campo"><select id="tm-hora"></select></div></div>
    <div class="fila-form"><label>Volumen aprox. (L):</label><div class="campo"><input type="number" id="tm-volumen" min="1" value="200"></div></div>
    <div class="fila-form"><label>Forma de pago:</label><div class="campo"><select id="tm-pago">${optPago}</select></div></div>
    <div class="fila-form"><label>Hangar / plataforma:</label><div class="campo"><select id="tm-hangar">${optHan}</select></div></div>
    <div class="fila-form"><label>Motivo / nota:</label><div class="campo"><input type="text" id="tm-motivo" placeholder="Ej.: pedido telefónico"></div></div>
    <label class="check-item" onclick="toggleCheck(this)" style="margin-top:6px">
      <input type="checkbox" id="tm-sobreturno">
      <span class="texto"><strong>Sobreturno</strong> — no gastar recursos de los turnos ya asignados (turno extra por encima de la capacidad del horario).</span>
    </label>
    <div class="botonera">
      <button class="btn btn-verde" onclick="crearTurnoManual()">Crear turno</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
  tmActualizarGrado();
  await tmCargarHoras();
}

function tmGradoSel() {
  const sel = $('#tm-matricula');
  return sel && sel.selectedOptions[0] ? sel.selectedOptions[0].dataset.grado : null;
}

function tmActualizarGrado() {
  const g = tmGradoSel();
  $('#tm-grado-info').innerHTML = g
    ? `<div style="margin:0 0 12px">${bannerGrado(g, 'Grado bloqueado por el maestro de la matrícula seleccionada')}</div>` : '';
  if ($('#tm-hora')) tmCargarHoras();
}

async function tmCargarHoras() {
  const g = tmGradoSel();
  const fecha = $('#tm-fecha').value;
  if (!g || !fecha) return;
  try {
    const data = await api(`/api/turnos/slots?fecha=${fecha}&grado=${encodeURIComponent(g)}`);
    const sobre = $('#tm-sobreturno')?.checked;
    $('#tm-hora').innerHTML = data.slots.map(s =>
      `<option value="${s.hora}" ${s.lleno && !sobre ? 'disabled' : ''}>${s.hora}${s.lleno ? (s.motivoLleno === 'recurso' ? ' — sin equipo' : ' — completo') : ` — ${s.libres} libre(s)`}</option>`).join('');
  } catch (e) { errorModal(e); }
}

async function crearTurnoManual() {
  try {
    const r = await api('/api/turnos', 'POST', {
      matricula: $('#tm-matricula').value, fecha: $('#tm-fecha').value, hora: $('#tm-hora').value,
      volumen: $('#tm-volumen').value, forma_pago: $('#tm-pago').value, hangar: $('#tm-hangar').value,
      motivo: $('#tm-motivo').value, sobreturno: $('#tm-sobreturno').checked,
    });
    cerrarModal(); render();
    alertaModal('Turno creado', `${r.codigo} creado${r.sobreturno ? ' como SOBRETURNO' : ''}. Aparece en pendientes para que le asignes abastecedora y operador.`);
  } catch (e) { errorModal(e); }
}

async function asignar(idTurno) {
  const ab = $(`#ab-${CSS.escape(idTurno)}`)?.value;
  const op = $(`#op-${CSS.escape(idTurno)}`)?.value;
  if (!ab || !op) return alertaModal('Faltan datos', 'Seleccioná la abastecedora y el operador para programar el turno.');
  try {
    await api(`/api/turnos/${idTurno}/asignar`, 'PUT', { abastecedora: ab, operador_id: op });
    render();
  } catch (e) { errorModal(e); }
}

async function abrirReprogramar(id, codigo, fecha, hora, grado) {
  window.__gradoReprog = grado || '';
  modal(`<h3>Cambiar horario — ${esc(codigo)}</h3>
    <div class="alerta azul">El cliente recibe automáticamente el nuevo horario junto con tu comentario.</div>
    <div class="fila-form"><label>Nueva fecha:</label>
      <div class="campo"><input type="date" id="rp-fecha" value="${fecha}" onchange="cargarSlotsReprog()"></div></div>
    <div class="fila-form"><label>Nuevo horario:</label>
      <div class="campo"><select id="rp-hora"></select></div></div>
    <div class="fila-form"><label>Comentario para el cliente:<small>Obligatorio</small></label>
      <div class="campo"><textarea id="rp-comentario" placeholder="Ej.: Adelantamos el turno por disponibilidad de la abastecedora"></textarea></div></div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="enviarReprogramar('${id}')">Reprogramar y avisar al cliente</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Volver</button>
    </div>`);
  window.__horaActual = hora;
  await cargarSlotsReprog();
}

async function cargarSlotsReprog() {
  const fecha = $('#rp-fecha').value;
  const g = window.__gradoReprog ? `&grado=${encodeURIComponent(window.__gradoReprog)}` : '';
  try {
    const data = await api(`/api/turnos/slots?fecha=${fecha}${g}`);
    $('#rp-hora').innerHTML = data.slots.map(s => {
      const sel = s.hora === window.__horaActual ? 'selected' : '';
      const nota = s.lleno ? (s.motivoLleno === 'recurso' ? ' — sin equipo' : ' — completo') : '';
      // el horario actual del turno queda seleccionable aunque figure lleno
      return `<option value="${s.hora}" ${s.lleno && s.hora !== window.__horaActual ? 'disabled' : ''} ${sel}>
        ${s.hora}${nota}</option>`;
    }).join('');
  } catch (e) { errorModal(e); }
}

async function enviarReprogramar(id) {
  try {
    await api(`/api/turnos/${id}/reprogramar`, 'PUT', {
      fecha: $('#rp-fecha').value, hora: $('#rp-hora').value, comentario: $('#rp-comentario').value,
    });
    cerrarModal(); render();
  } catch (e) { errorModal(e); }
}

/* ============================================================
   COORDINADOR / ADMIN — Clientes y sus usuarios
   ============================================================ */

async function renderClientes() {
  let clientes = [];
  try { clientes = await api('/api/clientes'); } catch (e) { return errorModal(e); }
  const filas = clientes.map(c => `
    <tr>
      <td><strong>${esc(c.nombre)}</strong>${c.autogestionado ? ' <span title="Registrado por autogestión">🔹</span>' : ''}</td>
      <td>${c.usuarios}</td>
      <td>${c.aeronaves}</td>
      <td>${c.activo ? '✅ Activo' : '⛔ Inactivo'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-verde btn-chico" onclick="abrirNuevoUsuarioCliente('${c.id}','${esc(c.nombre)}')">+ Usuario</button>
        ${USER.rol === 'admin' ? `<button class="btn btn-gris btn-chico" onclick="toggleCliente('${c.id}',${c.activo ? 0 : 1})">${c.activo ? 'Desactivar' : 'Reactivar'}</button>` : ''}
      </td>
    </tr>`).join('');
  $('#main').innerHTML = `
    <h2 class="titulo-seccion">Clientes</h2>
    <p class="subtitulo">El registro autogestionado crea un solo usuario por cliente; los usuarios adicionales se agregan desde acá.</p>
    <div class="panel">
      <div class="tabla-scroll"><table>
        <thead><tr><th>Cliente</th><th>Usuarios</th><th>Aeronaves</th><th>Estado</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
      ${USER.rol === 'admin' ? `<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <input type="text" id="nc-nombre" placeholder="Nombre del nuevo cliente" style="max-width:320px">
        <button class="btn btn-verde btn-chico" onclick="altaCliente()">+ Crear cliente</button>
      </div>` : ''}
    </div>`;
}

function abrirNuevoUsuarioCliente(clienteId, nombreCliente) {
  modal(`<h3>Agregar usuario a ${esc(nombreCliente)}</h3>
    <div class="fila-form"><label>Nombre:</label><div class="campo"><input type="text" id="nu-nombre"></div></div>
    <div class="fila-form"><label>Email:</label><div class="campo"><input type="text" id="nu-email"></div></div>
    <div class="fila-form"><label>Contraseña:<small>Mínimo 8 caracteres</small></label>
      <div class="campo"><input type="password" id="nu-pass"></div></div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="enviarNuevoUsuarioCliente('${clienteId}')">Crear usuario</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
}

async function enviarNuevoUsuarioCliente(clienteId) {
  try {
    const r = await api(`/api/clientes/${clienteId}/usuarios`, 'POST', {
      nombre: $('#nu-nombre').value, email: $('#nu-email').value, password: $('#nu-pass').value,
    });
    cerrarModal(); render();
    alertaModal('Usuario creado', r.mail_enviado
      ? 'Se le envió un mail de bienvenida con sus credenciales de acceso.'
      : 'El envío de mails no está configurado: pasale el email y la contraseña por otro medio.');
  } catch (e) { errorModal(e); }
}

async function altaCliente() {
  try { await api('/api/clientes', 'POST', { nombre: $('#nc-nombre').value }); render(); }
  catch (e) { errorModal(e); }
}

async function toggleCliente(id, activo) {
  try { await api(`/api/clientes/${id}`, 'PUT', { activo }); render(); } catch (e) { errorModal(e); }
}

/* ============================================================
   ADMIN — Maestros
   ============================================================ */

async function renderMaestros() {
  const esAdmin = USER.rol === 'admin';
  /* El coordinador administra clientes, matrículas, hangares y abastecedoras.
     Operadores y Usuarios quedan solo para admin. */
  const defs = [['aeronaves', '✈ Aeronaves'], ['hangares', '🏢 Hangares'], ['abastecedoras', '🚛 Abastecedoras']];
  if (esAdmin) defs.push(['operadores', '👷 Operadores'], ['usuarios', '👤 Usuarios']);
  const permitidas = defs.map(d => d[0]);
  if (!permitidas.includes(TAB_MAESTRO)) TAB_MAESTRO = 'aeronaves';
  const tabs = defs.map(([k, n]) => `<button class="btn btn-chico ${TAB_MAESTRO === k ? 'btn-verde' : 'btn-gris'}"
      onclick="TAB_MAESTRO='${k}';render()">${n}</button>`).join(' ');
  let cuerpo = '';
  try {
    if (TAB_MAESTRO === 'aeronaves') cuerpo = await tabAeronaves();
    else if (TAB_MAESTRO === 'hangares') cuerpo = await tabHangares();
    else if (TAB_MAESTRO === 'abastecedoras') cuerpo = await tabAbastecedoras();
    else if (TAB_MAESTRO === 'operadores') cuerpo = await tabOperadores();
    else cuerpo = await tabUsuarios();
  } catch (e) { return errorModal(e); }
  $('#main').innerHTML = `
    <h2 class="titulo-seccion">Maestros</h2>
    <p class="subtitulo">El grado de cada matrícula es el dato crítico: bloquea todas las validaciones aguas abajo. Solo el rol <strong>admin</strong> puede modificarlo.</p>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">${tabs}</div>
    <div class="panel">${cuerpo}</div>`;
}

let CACHE_CLIENTES = [];

async function tabAeronaves() {
  const [aeronaves, clientes, hangares] = await Promise.all([
    api('/api/aeronaves'), api('/api/clientes'), api('/api/hangares')]);
  CACHE_CLIENTES = clientes; window.__hangares = hangares;
  const filas = aeronaves.map(a => `
    <tr>
      <td><strong>${esc(a.matricula)}</strong></td>
      <td>${esc(a.tipo)}</td>
      <td>${a.motor === 'TURBINA' ? 'Turbina' : 'Pistón'}</td>
      <td>${badgeGrado(a.grado)}${a.excepcion_grado ? ' <span title="Excepción motor/grado autorizada">⚠</span>' : ''}</td>
      <td>${esc(a.cliente)}</td>
      <td>${esc(a.hangar)}</td>
      <td>${a.capacidad} L</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-gris btn-chico" onclick='abrirEditarAeronave(${JSON.stringify(a).replace(/'/g, "&#39;")})'>Editar</button>
        ${USER.rol === 'admin' ? `<button class="btn btn-blanco btn-chico" onclick="abrirCambioGrado('${esc(a.matricula)}','${a.grado}','${a.motor}')">Cambiar grado</button>` : ''}
      </td>
    </tr>`).join('');
  return `
    <h3 style="margin-bottom:12px">Maestro de matrículas (${aeronaves.length}) — únicas en todo el sistema</h3>
    <div class="tabla-scroll"><table>
      <thead><tr><th>Matrícula</th><th>Tipo</th><th>Motor</th><th>Grado</th><th>Cliente</th><th>Hangar</th><th>Cap.</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
}

function abrirEditarAeronave(a) {
  const optCli = CACHE_CLIENTES.map(c => `<option value="${c.id}" ${c.id === a.cliente_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  const optHan = (window.__hangares || []).map(h => `<option value="${h.codigo}" ${h.codigo === a.hangar ? 'selected' : ''}>(${h.codigo}) ${esc(h.nombre)}</option>`).join('');
  modal(`<h3>Editar ${esc(a.matricula)}</h3>
    <div class="alerta azul">El grado (${esc(a.grado)}) no se edita acá: usá "Cambiar grado", que exige confirmación escrita.</div>
    <div class="fila-form"><label>Tipo:</label><div class="campo"><input type="text" id="ea-tipo" value="${esc(a.tipo)}"></div></div>
    <div class="fila-form"><label>Cliente:</label><div class="campo"><select id="ea-cliente">${optCli}</select></div></div>
    <div class="fila-form"><label>Hangar:</label><div class="campo"><select id="ea-hangar">${optHan}</select></div></div>
    <div class="fila-form"><label>Capacidad (L):</label><div class="campo"><input type="number" id="ea-capacidad" value="${a.capacidad}"></div></div>
    <div class="fila-form"><label>Activa:</label><div class="campo"><select id="ea-activa">
      <option value="1" ${a.activa ? 'selected' : ''}>Sí</option><option value="0" ${a.activa ? '' : 'selected'}>No</option></select></div></div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="guardarEdicionAeronave('${esc(a.matricula)}')">Guardar</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
}

async function guardarEdicionAeronave(matricula) {
  try {
    await api(`/api/aeronaves/${encodeURIComponent(matricula)}`, 'PUT', {
      tipo: $('#ea-tipo').value, cliente_id: $('#ea-cliente').value,
      hangar: $('#ea-hangar').value, capacidad: $('#ea-capacidad').value,
      activa: $('#ea-activa').value === '1',
    });
    cerrarModal(); render();
  } catch (e) { errorModal(e); }
}

function abrirCambioGrado(matricula, gradoActual, motor) {
  const otro = gradoActual === 'JET A-1' ? 'AVGAS 100LL' : 'JET A-1';
  const esperado = MOTORES[motor].gradoEsperado;
  modal(`<h3>⚠ Cambio de grado — ${esc(matricula)}</h3>
    <div class="alerta roja">
      <strong>Operación crítica (solo admin).</strong> Vas a cambiar el grado de ${esc(matricula)}
      de ${badgeGrado(gradoActual)} a ${badgeGrado(otro)}.<br><br>
      Un grado mal registrado <strong>anula todas las barreras anti-misfuelling</strong>: cliente, coordinador y operador
      validarán contra un dato equivocado. Cambialo solo si la aeronave fue <strong>remotorizada</strong> o el alta fue un
      error verificado con la documentación.
      ${otro !== esperado ? `<br><br>🚨 Además, ${otro} <strong>no es el grado esperado</strong> para un motor ${MOTORES[motor].nombre.toLowerCase()} (esperado: ${esperado}).` : ''}
      <br><br>Los turnos activos de esta matrícula se <strong>cancelarán automáticamente</strong> y el cliente será notificado.
    </div>
    <div class="fila-form">
      <label>Confirmación escrita:<small>Escribí exactamente: CAMBIAR GRADO ${esc(matricula)}</small></label>
      <div class="campo"><input type="text" id="cg-confirmacion" autocomplete="off"></div>
    </div>
    <div class="botonera">
      <button class="btn btn-blanco" onclick="enviarCambioGrado('${esc(matricula)}','${otro}')">Cambiar a ${otro}</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
}

async function enviarCambioGrado(matricula, grado) {
  try {
    const r = await api(`/api/aeronaves/${encodeURIComponent(matricula)}/grado`, 'PUT', {
      grado, confirmacion: $('#cg-confirmacion').value,
    });
    cerrarModal(); render();
    alertaModal('Grado actualizado',
      `${matricula} ahora tiene grado ${grado}.${r.cancelados ? ` Se cancelaron ${r.cancelados} turno(s) activo(s) y se notificó al cliente.` : ''}${r.excepcion ? ' ⚠ Quedó marcada como excepción motor/grado.' : ''}`);
  } catch (e) { errorModal(e); }
}

async function tabHangares() {
  const hangares = await api('/api/hangares');
  const filas = hangares.map(h => `<tr><td><strong>${h.codigo}</strong></td><td>${esc(h.nombre)}</td>
    <td><button class="btn btn-gris btn-chico" onclick="renombrarHangar('${h.codigo}','${esc(h.nombre)}')">Renombrar</button></td></tr>`).join('');
  return `<h3 style="margin-bottom:12px">Hangares y plataformas (${hangares.length})</h3>
    <div class="tabla-scroll"><table><thead><tr><th>Código</th><th>Nombre</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <input type="text" id="nh-codigo" placeholder="Código (ej. H15)" style="max-width:150px">
      <input type="text" id="nh-nombre" placeholder="Nombre" style="max-width:320px">
      <button class="btn btn-verde btn-chico" onclick="altaHangar()">+ Agregar</button>
    </div>`;
}

async function altaHangar() {
  try { await api('/api/hangares', 'POST', { codigo: $('#nh-codigo').value, nombre: $('#nh-nombre').value }); render(); }
  catch (e) { errorModal(e); }
}

function renombrarHangar(codigo, actual) {
  modal(`<h3>Renombrar ${esc(codigo)}</h3>
    <div class="fila-form"><label>Nuevo nombre:</label><div class="campo"><input type="text" id="rh-nombre" value="${esc(actual)}"></div></div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="enviarRenombrarHangar('${codigo}')">Guardar</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
}

async function enviarRenombrarHangar(codigo) {
  try { await api(`/api/hangares/${codigo}`, 'PUT', { nombre: $('#rh-nombre').value }); cerrarModal(); render(); }
  catch (e) { errorModal(e); }
}

async function tabAbastecedoras() {
  const abs = await api('/api/abastecedoras');
  const filas = abs.map(ab => `
    <tr>
      <td><strong>${ab.id}</strong></td><td>${esc(ab.nombre)}</td><td>${badgeGrado(ab.grado)}</td>
      <td><input type="number" id="cap-${ab.id}" value="${ab.capacidad}" style="max-width:110px"
           onchange="cambiarCapacidad('${ab.id}',this.value)"> L</td>
      <td>${ab.activa ? '✅ Activa' : '⛔ Fuera de servicio'}</td>
      <td><button class="btn btn-gris btn-chico" onclick="toggleAbastecedora('${ab.id}',${ab.activa ? 0 : 1})">
        ${ab.activa ? 'Fuera de servicio' : 'Reactivar'}</button></td>
    </tr>`).join('');
  return `<h3 style="margin-bottom:12px">Abastecedoras (${abs.length})</h3>
    <div class="alerta azul">Cada abastecedora está <strong>dedicada a un único grado</strong> (práctica estándar anti-misfuelling). La capacidad se edita directo en la tabla.</div>
    <div class="tabla-scroll"><table>
      <thead><tr><th>ID</th><th>Nombre</th><th>Grado</th><th>Capacidad</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <input type="text" id="nab-id" placeholder="ID (AB-04)" style="max-width:120px">
      <input type="text" id="nab-nombre" placeholder="Nombre" style="max-width:200px">
      <select id="nab-grado" style="max-width:170px"><option value="">Grado…</option>${GRADOS.map(g => `<option>${g}</option>`).join('')}</select>
      <input type="number" id="nab-capacidad" placeholder="Capacidad (L)" style="max-width:140px">
      <button class="btn btn-verde btn-chico" onclick="altaAbastecedora()">+ Agregar</button>
    </div>`;
}

async function cambiarCapacidad(id, capacidad) {
  try { await api(`/api/abastecedoras/${id}`, 'PUT', { capacidad }); } catch (e) { errorModal(e); render(); }
}
async function toggleAbastecedora(id, activa) {
  try { await api(`/api/abastecedoras/${id}`, 'PUT', { activa: !!activa }); render(); } catch (e) { errorModal(e); }
}
async function altaAbastecedora() {
  try {
    await api('/api/abastecedoras', 'POST', {
      id: $('#nab-id').value, nombre: $('#nab-nombre').value,
      grado: $('#nab-grado').value, capacidad: $('#nab-capacidad').value,
    });
    render();
  } catch (e) { errorModal(e); }
}

async function tabOperadores() {
  const ops = await api('/api/operadores');
  const filas = ops.map(o => `<tr><td>${esc(o.nombre)}</td><td>${o.activo ? '✅ Activo' : '⛔ Inactivo'}</td>
    <td><button class="btn btn-gris btn-chico" onclick="toggleOperador('${o.id}',${o.activo ? 0 : 1})">
      ${o.activo ? 'Desactivar' : 'Reactivar'}</button></td></tr>`).join('');
  return `<h3 style="margin-bottom:12px">Operadores de abastecedora (${ops.length})</h3>
    <p class="subtitulo">Personas asignables a los turnos. La operación de carga en sí se gestiona en el otro sistema.</p>
    <div class="tabla-scroll"><table><thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <input type="text" id="nop-nombre" placeholder="Nombre del operador" style="max-width:280px">
      <button class="btn btn-verde btn-chico" onclick="altaOperador()">+ Agregar</button>
    </div>`;
}

async function altaOperador() {
  try { await api('/api/operadores', 'POST', { nombre: $('#nop-nombre').value }); render(); }
  catch (e) { errorModal(e); }
}
async function toggleOperador(id, activo) {
  try { await api(`/api/operadores/${id}`, 'PUT', { activo: !!activo }); render(); } catch (e) { errorModal(e); }
}

async function tabUsuarios() {
  const [usuarios, clientes] = await Promise.all([api('/api/usuarios'), api('/api/clientes')]);
  CACHE_CLIENTES = clientes;
  const filas = usuarios.map(u => `
    <tr>
      <td>${esc(u.nombre)}</td><td>${esc(u.email)}</td>
      <td><span class="rol-tag">${u.rol}</span></td>
      <td>${esc(u.cliente || '—')}</td>
      <td>${u.activo ? '✅' : '⛔'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-gris btn-chico" onclick="resetPassword('${u.id}','${esc(u.email)}')">Nueva contraseña</button>
        <button class="btn btn-gris btn-chico" onclick="toggleUsuario('${u.id}',${u.activo ? 0 : 1})">${u.activo ? 'Desactivar' : 'Reactivar'}</button>
      </td>
    </tr>`).join('');
  const optCli = clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  return `<h3 style="margin-bottom:12px">Usuarios (${usuarios.length})</h3>
    <div class="tabla-scroll"><table>
      <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Cliente</th><th>Activo</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div>
    <h3 style="margin:20px 0 10px">Crear usuario</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input type="text" id="nusr-nombre" placeholder="Nombre" style="max-width:180px">
      <input type="text" id="nusr-email" placeholder="Email" style="max-width:220px">
      <input type="password" id="nusr-pass" placeholder="Contraseña (8+)" style="max-width:170px">
      <select id="nusr-rol" style="max-width:150px" onchange="$('#nusr-cliente').style.display=this.value==='cliente'?'':'none'">
        <option value="coordinador">coordinador</option><option value="admin">admin</option><option value="cliente">cliente</option>
      </select>
      <select id="nusr-cliente" style="max-width:220px;display:none"><option value="">Cliente…</option>${optCli}</select>
      <button class="btn btn-verde btn-chico" onclick="altaUsuario()">+ Crear</button>
    </div>`;
}

async function altaUsuario() {
  try {
    await api('/api/usuarios', 'POST', {
      nombre: $('#nusr-nombre').value, email: $('#nusr-email').value, password: $('#nusr-pass').value,
      rol: $('#nusr-rol').value, cliente_id: $('#nusr-cliente').value || null,
    });
    render();
  } catch (e) { errorModal(e); }
}

function resetPassword(id, email) {
  modal(`<h3>Nueva contraseña para ${esc(email)}</h3>
    <div class="fila-form"><label>Contraseña nueva:<small>Mínimo 8 caracteres</small></label>
      <div class="campo"><input type="password" id="rp-pass"></div></div>
    <div class="botonera">
      <button class="btn btn-verde" onclick="enviarResetPassword('${id}')">Guardar</button>
      <button class="btn btn-gris" onclick="cerrarModal()">Cancelar</button>
    </div>`);
}

async function enviarResetPassword(id) {
  try {
    const r = await api(`/api/usuarios/${id}`, 'PUT', { password: $('#rp-pass').value });
    cerrarModal();
    alertaModal('Contraseña restablecida', r.mail_enviado
      ? 'Se le avisó por mail con la nueva contraseña.'
      : 'El envío de mails no está configurado: pasale la nueva contraseña por otro medio.');
  } catch (e) { errorModal(e); }
}

async function toggleUsuario(id, activo) {
  try { await api(`/api/usuarios/${id}`, 'PUT', { activo: !!activo }); render(); } catch (e) { errorModal(e); }
}

/* ============================================================
   ADMIN — Configuración de la grilla de turnos
   ============================================================ */

async function renderConfig() {
  try { CONFIG = await api('/api/config'); } catch (e) { return errorModal(e); }
  $('#main').innerHTML = `
    <h2 class="titulo-seccion">Configuración de turnos</h2>
    <p class="subtitulo">Cambios aplican a los turnos nuevos; los ya pedidos conservan su horario.</p>
    <div class="panel">
      ${CONFIG.mail_configurado
        ? '<div class="alerta verde">📧 <strong>Envío de mails activo</strong> (Brevo). Los usuarios nuevos reciben sus credenciales, los restablecimientos avisan por mail y funciona "¿Olvidaste tu contraseña?".</div>'
        : '<div class="alerta amarilla">📧 <strong>Envío de mails no configurado.</strong> Los usuarios se crean igual pero hay que pasarles las credenciales a mano, y la recuperación autogestionada de contraseña está deshabilitada. Para activarlo (gratis): crear cuenta en Brevo y setear BREVO_API_KEY, MAIL_FROM y APP_URL — ver DEPLOY.md.</div>'}
    </div>
    <div class="panel">
      <div class="config-grid">
        <div class="campo-cfg"><label>Intervalo entre turnos (min):</label>
          <input type="number" id="cfg-intervalo" min="5" max="120" step="5" value="${CONFIG.intervalo_minutos}"></div>
        <div class="campo-cfg"><label>Hora de inicio:</label>
          <input type="text" id="cfg-inicio" placeholder="08:00" value="${CONFIG.hora_inicio}"></div>
        <div class="campo-cfg"><label>Hora de fin:</label>
          <input type="text" id="cfg-fin" placeholder="18:00" value="${CONFIG.hora_fin}"></div>
        <div class="campo-cfg"><label>Cargas simultáneas por horario:</label>
          <input type="number" id="cfg-capacidad" min="1" max="20" value="${CONFIG.capacidad_por_slot}"></div>
        <div class="campo-cfg"><label>Días de anticipación:</label>
          <input type="number" id="cfg-dias" min="1" max="60" value="${CONFIG.dias_anticipacion}"></div>
      </div>
      <div class="botonera">
        <button class="btn btn-verde" onclick="guardarConfig()">Guardar configuración</button>
      </div>
    </div>`;
}

async function guardarConfig() {
  try {
    CONFIG = await api('/api/config', 'PUT', {
      intervalo_minutos: $('#cfg-intervalo').value,
      hora_inicio: $('#cfg-inicio').value,
      hora_fin: $('#cfg-fin').value,
      capacidad_por_slot: $('#cfg-capacidad').value,
      dias_anticipacion: $('#cfg-dias').value,
    });
    alertaModal('Configuración guardada', `Turnos cada ${CONFIG.intervalo_minutos} min, de ${CONFIG.hora_inicio} a ${CONFIG.hora_fin}, ${CONFIG.capacidad_por_slot} carga(s) simultánea(s).`);
  } catch (e) { errorModal(e); }
}

/* ============================================================
   Info misfuelling + arranque
   ============================================================ */

function modalMisfuelling() {
  modal(`
    <h3>⛽ ¿Qué es el misfuelling y cómo lo previene este sistema?</h3>
    <p style="font-size:14px;line-height:1.7;margin-bottom:10px">
      <strong>Misfuelling</strong> es cargar a una aeronave un combustible de grado equivocado. El caso más peligroso es cargar
      <strong>JET A-1 en un motor a pistón</strong> que requiere AVGAS 100LL: el motor puede funcionar en tierra,
      pero detona y falla en vuelo, generalmente poco después del despegue.</p>
    <p style="font-size:14px;font-weight:800;margin-bottom:6px">Barreras del sistema (defensa en profundidad):</p>
    <ol style="font-size:13.5px;line-height:1.8;padding-left:22px">
      <li><strong>Grado bloqueado por matrícula:</strong> lo fija el maestro; el cliente no lo elige y solo el admin puede cambiarlo, con confirmación escrita.</li>
      <li><strong>Coherencia motor ↔ grado en el alta</strong>, con excepción confirmada por escrito (ej. diésel aeronáutico).</li>
      <li><strong>Matrículas únicas por sistema y asociadas a un cliente:</strong> cada usuario solo puede pedir turnos para sus aeronaves.</li>
      <li><strong>Detección de matrículas parecidas</strong> al dar de alta.</li>
      <li><strong>Confirmación positiva:</strong> tipear la matrícula exacta para confirmar el pedido (validada también en el servidor).</li>
      <li><strong>Bloqueo duro en la asignación:</strong> una abastecedora de grado distinto no se puede programar bajo ninguna circunstancia.</li>
      <li><strong>Abastecedoras monogrado</strong> y validaciones de volumen contra la capacidad de la aeronave.</li>
      <li><strong>Cambio de grado cancela los turnos activos</strong> y notifica al cliente, para que ningún turno viaje con un grado viejo.</li>
    </ol>
    <div class="botonera"><button class="btn btn-verde" onclick="cerrarModal()">Entendido</button></div>`);
}

document.getElementById('link-misfuelling').addEventListener('click', modalMisfuelling);
iniciar();
