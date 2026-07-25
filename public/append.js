
/* Calendario Mensual */
let CALENDARIO_MES = hoyISO().substring(0, 7); // YYYY-MM
async function renderCalendarioMensual() {
  let data = {};
  try { data = await api(`/api/turnos/mensual?mes=${CALENDARIO_MES}`); } catch(e) { console.error(e); }
  
  const [y, m] = CALENDARIO_MES.split("-").map(Number);
  const primerDiaMes = new Date(y, m - 1, 1).getDay();
  const diasMes = new Date(y, m, 0).getDate();
  
  const diasNombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  let html = `
    <div class="panel" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">Calendario ${y}-${String(m).padStart(2,"0")}</h3>
        <div>
          <input type="month" value="${CALENDARIO_MES}" style="padding:4px 8px;border:1px solid var(--borde);border-radius:4px" 
                 onchange="CALENDARIO_MES=this.value;renderCalendarioMensual()">
        </div>
      </div>
      <div class="calendario">`;
      
  diasNombres.forEach(d => { html += `<div class="calendario-header">${d}</div>`; });
  
  for (let i = 0; i < primerDiaMes; i++) {
    html += `<div class="calendario-dia fuera-mes"></div>`;
  }
  
  for (let dia = 1; dia <= diasMes; dia++) {
    const fecha = `${y}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const hoy = fecha === hoyISO();
    const act = fecha === FILTRO_FECHA;
    const d = data[fecha] || { total: 0, pendientes: 0, programados: 0 };
    
    html += `<div class="calendario-dia ${act ? "activo" : ""}" onclick="FILTRO_FECHA=\"${fecha}\"; render();">
      <div class="cal-num">${dia} ${hoy ? "<span style=\"color:var(--azul);font-size:10px\">(Hoy)</span>" : ""}</div>`;
      
    if (d.pendientes > 0) html += `<div class="cal-indicador cal-pendientes"><span>Pendientes</span><span>${d.pendientes}</span></div>`;
    if (d.programados > 0) html += `<div class="cal-indicador cal-programados"><span>Programados</span><span>${d.programados}</span></div>`;
    
    html += `<div class="cal-total">${d.total} turno(s)</div>
    </div>`;
  }
  
  html += `</div></div>`;
  
  const div = document.getElementById("calendario-container");
  if (div) div.innerHTML = html;
}

