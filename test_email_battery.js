const fs = require('fs');
const path = require('path');

// Cargar entorno de pruebas
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

const {
  enviarMail,
  mailBienvenida,
  mailRecuperacion,
  mailPasswordRestablecida,
  mailTurnoAsignado,
  mailTurnoReprogramado,
  mailTurnoCancelado,
} = require('./mailer');

const DESTINATARIO = 'juan.m.gonzalez@ypf.com';
const APP_URL = process.env.APP_URL || 'https://turnera-test-juanmg1984.onrender.com';

async function ejecutarBateriaPruebasMails() {
  console.log(`===========================================================`);
  console.log(`📧 BATERÍA DE PRUEBAS DE ENVÍO DE MAILS (ENTORNO TEST)`);
  console.log(`===========================================================`);
  console.log(`🎯 Destinatario: ${DESTINATARIO}`);
  console.log(`🌐 APP URL: ${APP_URL}`);
  console.log(`🔑 Brevo API Key: ${process.env.BREVO_API_KEY ? 'CONFIGURADA' : 'NO CONFIGURADA'}`);
  console.log(`✉️ Mail From: ${process.env.MAIL_FROM}`);
  console.log(`-----------------------------------------------------------\n`);

  const resultados = [];

  // PRUEBA 1: Mail de Bienvenida a nuevo usuario
  console.log(`[1/6] Enviando mail de Bienvenida a nuevo usuario...`);
  const res1 = await enviarMail(
    DESTINATARIO,
    '¡Bienvenido/a al sistema de turnos! — Aeroplanta San Fernando',
    mailBienvenida('Juan M. González', DESTINATARIO, APP_URL, 'YpfTest2026!', 'YPF S.A.')
  );
  console.log(`   Result: ${res1.enviado ? '✅ ENVIADO EXITOSAMENTE' : '❌ ERROR AL ENVIAR'}`);
  resultados.push({ caso: '1. Mail de Bienvenida', enviado: res1.enviado });

  // PRUEBA 2: Mail de Recuperación de Contraseña
  console.log(`[2/6] Enviando mail de Recuperación de contraseña...`);
  const res2 = await enviarMail(
    DESTINATARIO,
    'Recuperación de contraseña — Turnos Aeroplanta San Fernando',
    mailRecuperacion('Juan M. González', `${APP_URL}/?reset=token_demo_test_123456`)
  );
  console.log(`   Result: ${res2.enviado ? '✅ ENVIADO EXITOSAMENTE' : '❌ ERROR AL ENVIAR'}`);
  resultados.push({ caso: '2. Recuperación de Contraseña', enviado: res2.enviado });

  // PRUEBA 3: Restablecimiento de contraseña por administrador
  console.log(`[3/6] Enviando mail de Restablecimiento de contraseña por Admin...`);
  const res3 = await enviarMail(
    DESTINATARIO,
    'Tu contraseña fue restablecida — Turnos Aeroplanta San Fernando',
    mailPasswordRestablecida('Juan M. González', DESTINATARIO, 'NuevaPass2026#', APP_URL)
  );
  console.log(`   Result: ${res3.enviado ? '✅ ENVIADO EXITOSAMENTE' : '❌ ERROR AL ENVIAR'}`);
  resultados.push({ caso: '3. Password Restablecida por Admin', enviado: res3.enviado });

  // PRUEBA 4: Notificación de Turno Asignado (Programado con Abastecedora y Chofer)
  console.log(`[4/6] Enviando mail de Turno Asignado / Programado...`);
  const dummyTurno = {
    codigo: 'TRN-2026-0799',
    fecha: '2026-07-28',
    hora: '10:30',
    matricula: 'LV-YPF',
    tipo_aeronave: 'Gulfstream G280',
    grado: 'JET A-1',
    volumen: 4500,
    hangar: 'Hangar 3 - YPF',
    cuenta_corriente: 'CC-994821',
    comentario_coordinador: 'Turno confirmado por la aeroplanta. Abastecedora asignada.'
  };
  const res4 = await enviarMail(
    DESTINATARIO,
    `Turno ${dummyTurno.codigo} confirmado`,
    mailTurnoAsignado(dummyTurno, 'Abastecedora YPF #1 (JET A-1)', 'Carlos Chofer', APP_URL)
  );
  console.log(`   Result: ${res4.enviado ? '✅ ENVIADO EXITOSAMENTE' : '❌ ERROR AL ENVIAR'}`);
  resultados.push({ caso: '4. Turno Asignado / Programado', enviado: res4.enviado });

  // PRUEBA 5: Notificación de Turno Reprogramado
  console.log(`[5/6] Enviando mail de Turno Reprogramado...`);
  const res5 = await enviarMail(
    DESTINATARIO,
    `Turno ${dummyTurno.codigo} reprogramado`,
    mailTurnoReprogramado(
      { ...dummyTurno, hora: '12:00' },
      '2026-07-28 · 10:30 hs',
      'Ajuste por demoras meteorológicas en plataforma.',
      APP_URL
    )
  );
  console.log(`   Result: ${res5.enviado ? '✅ ENVIADO EXITOSAMENTE' : '❌ ERROR AL ENVIAR'}`);
  resultados.push({ caso: '5. Turno Reprogramado', enviado: res5.enviado });

  // PRUEBA 6: Notificación de Turno Cancelado
  console.log(`[6/6] Enviando mail de Turno Cancelado...`);
  const res6 = await enviarMail(
    DESTINATARIO,
    `Turno ${dummyTurno.codigo} cancelado`,
    mailTurnoCancelado(dummyTurno, 'Solicitado por la aeronave por cambio de itinerario.', APP_URL)
  );
  console.log(`   Result: ${res6.enviado ? '✅ ENVIADO EXITOSAMENTE' : '❌ ERROR AL ENVIAR'}`);
  resultados.push({ caso: '6. Turno Cancelado', enviado: res6.enviado });

  console.log(`\n===========================================================`);
  console.log(`📊 RESUMEN FINAL DE LA BATERÍA DE PRUEBAS`);
  console.log(`===========================================================`);
  resultados.forEach(r => console.log(`${r.enviado ? '✅' : '❌'} ${r.caso}`));
}

ejecutarBateriaPruebasMails().catch(console.error);
