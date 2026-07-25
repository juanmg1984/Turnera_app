const db = require('./db');

async function test() {
  try {
    const mes = '2026-07';
    console.log("Querying for:", `${mes}-%`);
    const rows = await db.query(`
      SELECT fecha, 
             COUNT(*) as total,
             SUM(CASE WHEN estado = 'PENDIENTE' THEN 1 ELSE 0 END) as pendientes,
             SUM(CASE WHEN estado = 'PROGRAMADO' THEN 1 ELSE 0 END) as programados
      FROM turnos 
      WHERE fecha LIKE ? AND estado IN ('PENDIENTE', 'PROGRAMADO', 'ABASTECIDO', 'AUSENTE', 'CANCELADO')
      GROUP BY fecha
    `, [`${mes}-%`]);
    console.log("Rows:", rows);
    
    const all = await db.query(`SELECT fecha, estado FROM turnos LIMIT 5`);
    console.log("Sample turnos:", all);
  } catch(e) {
    console.error(e);
  }
}
test();
