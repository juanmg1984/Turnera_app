/* ============================================================
   Envío de mails — Brevo (https://brevo.com), plan gratuito.
   Se envía por API HTTPS (sin SMTP, sin dependencias).
   Sin BREVO_API_KEY el sistema funciona igual: los mails se
   registran en consola y las respuestas indican "no enviado".

   Variables de entorno:
     BREVO_API_KEY   — API key de Brevo (xkeysib-…)
     MAIL_FROM       — remitente verificado en Brevo
     MAIL_FROM_NOMBRE— nombre visible (opcional)
     APP_URL         — URL pública de la app (para los links)
   ============================================================ */

const mailConfigurado = () => !!process.env.BREVO_API_KEY && !!process.env.MAIL_FROM;

async function enviarMail(para, asunto, html) {
  if (!mailConfigurado()) {
    console.log(`\n[MAIL NO CONFIGURADO — no se envió]\nPara: ${para}\nAsunto: ${asunto}\n${html}\n`);
    return { enviado: false };
  }
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NOMBRE || 'Turnos Aeroplanta San Fernando' },
        to: [{ email: para }],
        subject: asunto,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.error('Error de Brevo:', r.status, await r.text().catch(() => ''));
      return { enviado: false };
    }
    return { enviado: true };
  } catch (e) {
    console.error('Error enviando mail:', e.message);
    return { enviado: false };
  }
}

/* ---------------- Plantillas ---------------- */

function plantilla(titulo, cuerpo) {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #d6d9e0;border-radius:12px;overflow:hidden">
    <div style="background:#0451DD;color:#fff;padding:18px 24px">
      <div style="font-size:18px;font-weight:800">Turnos de Carga — Aeroplanta San Fernando</div>
      <div style="font-size:12px;opacity:.85">Abastecimiento de aeronaves · SADF</div>
    </div>
    <div style="padding:24px;color:#2b2f38;font-size:14px;line-height:1.7">
      <h2 style="font-size:16px;margin:0 0 12px">${titulo}</h2>
      ${cuerpo}
    </div>
    <div style="padding:14px 24px;background:#f6f7f9;color:#6b7280;font-size:11.5px">
      Este mail fue generado automáticamente por el sistema de turnos. No respondas a esta casilla.
    </div>
  </div>`;
}

function mailBienvenida(nombre, email, appUrl, passwordInicial, clienteNombre) {
  const credenciales = passwordInicial
    ? `<p>Tus credenciales de acceso son:</p>
       <table style="border-collapse:collapse;font-size:14px">
         <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Usuario:</td><td><strong>${email}</strong></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Contraseña inicial:</td><td><strong>${passwordInicial}</strong></td></tr>
       </table>
       <p>⚠ Por seguridad, cambiá la contraseña al ingresar (botón 🔑 arriba a la derecha).</p>`
    : `<p>Ya podés ingresar con tu email <strong>${email}</strong> y la contraseña que definiste.</p>`;
  return plantilla(`¡Bienvenido/a, ${nombre}!`,
    `<p>Se creó tu usuario en el sistema de turnos de abastecimiento de la Aeroplanta San Fernando${clienteNombre ? `, asociado al cliente <strong>${clienteNombre}</strong>` : ''}.</p>
     ${credenciales}
     <p style="margin-top:18px"><a href="${appUrl}" style="background:#0451DD;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700">Ingresar al sistema</a></p>`);
}

function mailRecuperacion(nombre, urlReset) {
  return plantilla('Recuperación de contraseña',
    `<p>Hola ${nombre}: pediste restablecer tu contraseña del sistema de turnos.</p>
     <p style="margin-top:14px"><a href="${urlReset}" style="background:#0451DD;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700">Crear nueva contraseña</a></p>
     <p style="color:#6b7280;font-size:12.5px">El link vence en 1 hora y sirve una sola vez. Si no fuiste vos, ignorá este mail: tu contraseña actual sigue vigente.</p>`);
}

function mailPasswordRestablecida(nombre, email, passwordNueva, appUrl) {
  return plantilla('Tu contraseña fue restablecida',
    `<p>Hola ${nombre}: el administrador de la planta restableció tu contraseña.</p>
     <table style="border-collapse:collapse;font-size:14px">
       <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Usuario:</td><td><strong>${email}</strong></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Contraseña nueva:</td><td><strong>${passwordNueva}</strong></td></tr>
     </table>
     <p>⚠ Cambiala al ingresar (botón 🔑 arriba a la derecha).</p>
     <p style="margin-top:14px"><a href="${appUrl}" style="background:#0451DD;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700">Ingresar</a></p>`);
}

/* Aviso al cliente cuando la planta asigna abastecedora y chofer. */
function mailTurnoAsignado(t, abastecedora, operador, appUrl) {
  const colorGrado = t.grado === 'JET A-1' ? '#111111' : '#C81E1E';
  const fila = (k, v) => `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap">${k}</td><td><strong>${v}</strong></td></tr>`;
  return plantilla(`Turno ${t.codigo} confirmado`,
    `<p>Tu turno de abastecimiento quedó <strong>programado</strong>. Estos son los datos asignados por la planta:</p>
     <div style="background:${colorGrado};color:#fff;text-align:center;padding:14px;margin:14px 0;border-radius:2px">
       <div style="font-size:22px;font-weight:800;letter-spacing:1px">⛽ ${t.grado}</div>
       <div style="font-size:12px;opacity:.85">Código de color internacional: ${t.grado === 'JET A-1' ? 'NEGRO' : 'ROJO'}</div>
     </div>
     <table style="border-collapse:collapse;font-size:14px">
       ${fila('Fecha y hora:', `${t.fecha} · ${t.hora} hs`)}
       ${fila('Aeronave:', `${t.matricula} — ${t.tipo_aeronave}`)}
       ${fila('Abastecedora:', abastecedora)}
       ${fila('Chofer / operador:', operador)}
       ${fila('Volumen estimado:', `${t.volumen} L`)}
       ${fila('Hangar / posición:', t.hangar)}
       ${t.cuenta_corriente ? fila('Cuenta corriente:', t.cuenta_corriente) : ''}
     </table>
     ${t.comentario_coordinador ? `<p style="margin-top:14px">💬 <em>${t.comentario_coordinador}</em></p>` : ''}
     <p style="margin-top:18px"><a href="${appUrl}" style="background:#0451DD;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700">Ver mis turnos</a></p>
     <p style="color:#6b7280;font-size:12.5px;margin-top:14px">Verificá que el grado indicado coincida con el de tu aeronave antes de la carga.</p>`);
function mailTurnoCancelado(t, motivo, appUrl) {
  const fila = (k, v) => `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap">${k}</td><td><strong>${v}</strong></td></tr>`;
  return plantilla(`Turno ${t.codigo} cancelado`,
    `<p>Tu turno de abastecimiento ha sido <strong>cancelado</strong>.</p>
     <div style="background:#f3f4f6;color:#374151;padding:14px;margin:14px 0;border-left:4px solid #ef4444;border-radius:2px">
       <div style="font-weight:700">Motivo de cancelación:</div>
       <div style="margin-top:4px">${motivo}</div>
     </div>
     <table style="border-collapse:collapse;font-size:14px">
       ${fila('Fecha y hora original:', `${t.fecha} · ${t.hora} hs`)}
       ${fila('Aeronave:', `${t.matricula} — ${t.tipo_aeronave}`)}
     </table>
     <p style="margin-top:18px"><a href="${appUrl}" style="background:#0451DD;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700">Ver mis turnos</a></p>`);
}

function mailTurnoReprogramado(t, anterior, comentario, appUrl) {
  const fila = (k, v) => `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap">${k}</td><td><strong>${v}</strong></td></tr>`;
  return plantilla(`Turno ${t.codigo} reprogramado`,
    `<p>El coordinador ha <strong>reprogramado</strong> tu turno de abastecimiento.</p>
     <table style="border-collapse:collapse;font-size:14px;margin-top:14px">
       ${fila('Aeronave:', `${t.matricula} — ${t.tipo_aeronave}`)}
       ${fila('Horario anterior:', anterior)}
       ${fila('NUEVO HORARIO:', `<span style="color:#1d4ed8">${t.fecha} · ${t.hora} hs</span>`)}
     </table>
     <div style="background:#f0f9ff;color:#0369a1;padding:14px;margin:14px 0;border-left:4px solid #0284c7;border-radius:2px">
       <div style="font-weight:700">Comentario del coordinador:</div>
       <div style="margin-top:4px">${comentario}</div>
     </div>
     <p style="margin-top:18px"><a href="${appUrl}" style="background:#0451DD;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700">Ver mis turnos</a></p>`);
}

module.exports = {
  enviarMail, mailConfigurado, mailBienvenida, mailRecuperacion,
  mailPasswordRestablecida, mailTurnoAsignado, mailTurnoCancelado, mailTurnoReprogramado,
};

