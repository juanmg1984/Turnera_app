const db = require('node:sqlite');
const d = new db.DatabaseSync('turnera.db');

try {
  // Mock function to replicate backend logic for GET /api/aeronaves for a client
  const getAeronaves = (usuario_id) => {
    return d.prepare(`
      SELECT a.*, c.nombre AS cliente 
      FROM aeronaves a 
      LEFT JOIN clientes c ON c.id = a.cliente_id
      JOIN usuario_aeronaves ua ON ua.matricula = a.matricula
      WHERE ua.usuario_id = ? AND a.activa = 1 ORDER BY a.matricula
    `).all(usuario_id);
  };

  const vincular = (usuario_id, matricula) => {
    d.prepare(`INSERT OR IGNORE INTO usuario_aeronaves (usuario_id, matricula) VALUES (?, ?)`).run(usuario_id, matricula);
  };

  console.log("1. Get aeronaves for u3 (should be empty):", getAeronaves('u3').length);
  
  console.log("2. Vincular LV-HQR...");
  vincular('u3', 'LV-HQR');
  
  const aeronaves = getAeronaves('u3');
  console.log("3. Get aeronaves for u3 after vinculacion:", aeronaves.length);
  if (aeronaves.length > 0) {
    console.log("   First aeronave:", aeronaves[0].matricula, aeronaves[0].cliente);
  }

  console.log("4. Simulating turno creation validation...");
  const matriculaTurno = 'LV-HQR';
  const a = d.prepare(`SELECT * FROM aeronaves WHERE matricula = ? AND activa = 1`).get(matriculaTurno);
  
  let valid = false;
  if (a.cliente_id !== 'c1') {
    const vinculada = d.prepare(`SELECT 1 FROM usuario_aeronaves WHERE usuario_id = ? AND matricula = ?`).get('u3', matriculaTurno);
    if (!vinculada) {
      console.log("   Validation failed: Not linked");
    } else {
      console.log("   Validation passed: Aircraft is linked to user!");
      valid = true;
    }
  } else {
    valid = true;
  }
  
  console.log("Success:", valid);

} catch (e) {
  console.error(e);
}
