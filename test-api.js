const db = require('./db.js');
async function run() {
  const rows = await db.query(`SELECT fecha, estado FROM turnos WHERE fecha >= '2026-07-01' AND fecha <= '2026-07-31' AND estado IN ('PENDIENTE', 'PROGRAMADO', 'ABASTECIDO', 'AUSENTE', 'CANCELADO')`);
  console.log("ROWS:", rows);
  const resumen = {};
    for (const r of rows) {
      const f = r.fecha || r[0]; // Fallback por si libsql devuelve array
      const est = r.estado || r[1];
      if (!f) continue;
      
      if (!resumen[f]) {
        resumen[f] = { total: 0, pendientes: 0, programados: 0 };
      }
      resumen[f].total++;
      if (est === 'PENDIENTE') resumen[f].pendientes++;
      if (est === 'PROGRAMADO') resumen[f].programados++;
    }
    console.log("RESUMEN:", resumen);
}
run();
