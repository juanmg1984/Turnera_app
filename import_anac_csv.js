/* ============================================================
   Importador de Padrón Oficial ANAC (datos.gob.ar / Transporte)
   Descarga el CSV oficial de operaciones aéreas en Argentina,
   extrae las matrículas únicas y actualiza las aeronaves con su modelo oficial.
   ============================================================ */

const { query } = require('./db');

const ANAC_CSV_URL = 'https://datos.transporte.gob.ar/dataset/21038a1a-c3c7-4494-b76a-3a2a8fbb83b5/resource/7b6d0103-0a69-4c67-aed9-33cb58ae12f5/download/202606-informe-ministerio-vf-matricula.csv';

function limpiarModelo(aeronaveRaw) {
  if (!aeronaveRaw || aeronaveRaw === '0') return null;
  // Convertir PAA-PA 46-500TP -> Piper PA-46-500TP
  let m = aeronaveRaw.trim();
  if (m.startsWith('PAA-PA')) m = m.replace('PAA-PA', 'Piper PA');
  else if (m.startsWith('CESSNA-')) m = m.replace('CESSNA-', 'Cessna ');
  else if (m.startsWith('AIB-')) m = m.replace('AIB-', 'Airbus ');
  else if (m.startsWith('BOEING-')) m = m.replace('BOEING-', 'Boeing ');
  else if (m.startsWith('EMB-')) m = m.replace('EMB-', 'Embraer ');
  else if (m.startsWith('BEECH-')) m = m.replace('BEECH-', 'Beechcraft ');
  else if (m.startsWith('LEARJET-')) m = m.replace('LEARJET-', 'Learjet ');
  return m;
}

async function procesarANAC() {
  console.log("Creando tabla padron_anac en SQLite...");
  await query(`
    CREATE TABLE IF NOT EXISTS padron_anac (
      matricula TEXT PRIMARY KEY,
      modelo TEXT NOT NULL,
      operador TEXT DEFAULT '',
      ultima_operacion TEXT
    )
  `);

  console.log("Descargando CSV oficial de ANAC...");
  const res = await fetch(ANAC_CSV_URL);
  if (!res.ok) throw new Error("Error HTTP descargando CSV: " + res.status);
  const text = await res.text();
  const lines = text.split('\n');

  console.log(`Procesando ${lines.length} registros del CSV oficial ANAC...`);
  const mapaMatriculas = new Map(); // matricula -> { modelo, operador, fecha }

  for (let i = 1; i < lines.length; i++) {
    const col = lines[i].split(';');
    if (col.length < 10) continue;
    const fecha = col[0]?.trim();
    const aerolinea = col[7]?.trim();
    const aeronaveRaw = col[8]?.trim();
    let mat = col[9]?.trim().toUpperCase();

    if (!mat || mat.length < 3 || mat === '0') continue;
    if (mat.length === 5 && mat.isalpha) mat = `${mat.slice(0, 2)}-${mat.slice(2)}`;

    const modelo = limpiarModelo(aeronaveRaw);
    if (!modelo) continue;

    if (!mapaMatriculas.has(mat) || fecha > mapaMatriculas.get(mat).fecha) {
      mapaMatriculas.set(mat, { modelo, operador: aerolinea !== '0' ? aerolinea : '', fecha });
    }
  }

  console.log(`Extraídas ${mapaMatriculas.size} matrículas únicas con modelo oficial ANAC.`);

  let insertados = 0;
  for (const [mat, data] of mapaMatriculas.entries()) {
    await query(`
      INSERT INTO padron_anac (matricula, modelo, operador, ultima_operacion)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(matricula) DO UPDATE SET
        modelo = excluded.modelo,
        operador = excluded.operador,
        ultima_operacion = excluded.ultima_operacion
    `, [mat, data.modelo, data.operador, data.fecha]);
    insertados++;
  }

  console.log(`Tabla padron_anac actualizada con ${insertados} registros.`);

  // Actualizar las aeronaves del maestro que estén en S/D
  console.log("Enriqueciendo tabla aeronaves del maestro...");
  const aeronavesSD = await query(`SELECT matricula FROM aeronaves WHERE tipo = 'S/D' OR tipo = ''`);
  let enriquecidas = 0;
  for (const a of aeronavesSD) {
    const anac = (await query(`SELECT modelo FROM padron_anac WHERE matricula = ?`, [a.matricula]))[0];
    if (anac && anac.modelo) {
      await query(`UPDATE aeronaves SET tipo = ? WHERE matricula = ?`, [anac.modelo, a.matricula]);
      enriquecidas++;
    }
  }

  console.log(`✅ ¡Enriquecimiento finalizado! Se actualizaron ${enriquecidas} aeronaves con modelo oficial ANAC.`);

  // Mostrar el resultado de LV-UNO
  const lvUno = (await query(`SELECT a.*, c.nombre as cliente_nombre FROM aeronaves a JOIN clientes c ON c.id = a.cliente_id WHERE a.matricula = 'LV-UNO'`))[0];
  console.log("\n--- RESULTADO PARA LV-UNO ---");
  console.log(JSON.stringify(lvUno, null, 2));
}

procesarANAC().catch(console.error);
