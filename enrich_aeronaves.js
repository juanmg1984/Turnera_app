/* ============================================================
   Script de Enriquecimiento de Aeronaves desde ICAO API & ADSDB
   Consulta las matrículas registradas (especialmente las que tienen tipo 'S/D')
   y actualiza el campo 'tipo' con el fabricante y modelo real devuelto por la API.
   ============================================================ */

const { query } = require('./db');

async function consultarExterno(matricula) {
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(matricula)}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (r.ok) {
      const j = await r.json();
      const a = j?.response?.aircraft;
      if (a) {
        const mfg = a.manufacturer || '';
        const mdl = a.type || '';
        const tipoStr = `${mfg} ${mdl}`.trim();
        if (tipoStr) return tipoStr;
      }
    }
  } catch {}

  return null;
}

async function enriquecer() {
  console.log("Iniciando enriquecimiento de aeronaves...");
  const aeronaves = await query(`SELECT matricula, tipo FROM aeronaves WHERE tipo = 'S/D' OR tipo = ''`);
  console.log(`Encontradas ${aeronaves.length} aeronaves pendientes de enriquecer.`);

  let actualizadas = 0;
  for (let i = 0; i < aeronaves.length; i++) {
    const m = aeronaves[i].matricula;
    process.stdout.write(`[${i + 1}/${aeronaves.length}] Consultando ${m}... `);
    const nuevoTipo = await consultarExterno(m);
    if (nuevoTipo) {
      await query(`UPDATE aeronaves SET tipo = ? WHERE matricula = ?`, [nuevoTipo, m]);
      console.log(`✅ ${nuevoTipo}`);
      actualizadas++;
    } else {
      console.log(`❌ Sin datos en registros externos`);
    }
    // Pequeño delay entre peticiones para ser amigable con la API
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nEnriquecimiento completado: ${actualizadas} aeronaves actualizadas.`);
}

enriquecer().catch(console.error);
