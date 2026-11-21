import { sb, esc, sincronizarHora, minuto, esHoy, fmtHora, fmtFecha, PERIODOS, ganador, agruparTabla, ICONOS, iconoJugada, TEXTO_JUGADA, debounce, aviso, explicarError } from './comun.js?v=3';

const D = { config: null, equipos: new Map(), partidos: [], tabla: [], goleadores: [], eventos: [], destacado: null };
const $vista = document.getElementById('vista');

document.querySelectorAll('[data-ic]').forEach((el) => { el.outerHTML = ICONOS[el.dataset.ic]; });
document.getElementById('compartir').innerHTML = ICONOS.compartir;
document.getElementById('compartir').addEventListener('click', async () => {
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) await navigator.share({ title: document.title, url });
    else { await navigator.clipboard.writeText(url); aviso('Enlace copiado'); }
  } catch (e) { /* cancelado */ }
});

const nombre = (id, desc) => (id && D.equipos.get(id) ? D.equipos.get(id).nombre : desc || 'Por definir');
const corto = (id, desc) => (id && D.equipos.get(id) ? D.equipos.get(id).corto : (desc || '?').slice(0, 3).toUpperCase());

function ruta() {
  const [r, id] = (location.hash.replace('#', '') || 'vivo').split('/');
  return { r: ['vivo', 'posiciones', 'llaves'].includes(r) ? r : 'vivo', id: id ? Number(id) : null };
}

function elegirDestacado(idPedido) {
  if (idPedido) return D.partidos.find((p) => p.id === idPedido) || null;
  const enJuego = D.partidos.filter((p) => p.estado === 'en_juego').sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en));
  if (enJuego.length) return enJuego[0];
  const fin = D.partidos.filter((p) => p.estado === 'finalizado').sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en));
  return fin[0] || null;
}

async function cargar() {
  try { await cargarDatos(); } catch (e) { $vista.innerHTML = `<section class="tarjeta" style="padding:18px"><h2 style="color:var(--roja-texto)">No se pudo cargar</h2><p class="sub" style="margin-top:8px">${esc(explicarError(e))}</p></section>`; }
}
async function cargarDatos() {
  const [cfg, eq, pa, ta, go] = await Promise.all([
    sb.from('copa_config').select('*').eq('id', 1).maybeSingle(),
    sb.from('copa_equipos').select('id,nombre,corto,grupo'),
    sb.from('copa_partidos').select('*').order('fecha_hora', { ascending: true, nullsFirst: false }).order('id'),
    sb.from('copa_tabla').select('*'),
    sb.from('copa_goleadores').select('*').order('goles', { ascending: false }).order('nombre').limit(15)
  ]);
  const err = [cfg, eq, pa, ta, go].find((x) => x.error);
  if (err) { $vista.innerHTML = `<section class="tarjeta" style="padding:18px"><h2 style="color:var(--roja-texto)">No se pudo cargar</h2><p class="sub" style="margin-top:8px">${esc(explicarError(err.error))}</p></section>`; return; }
  D.config = cfg.data;
  D.equipos = new Map(eq.data.map((e) => [e.id, e]));
  D.partidos = pa.data;
  D.tabla = ta.data;
  D.goleadores = go.data;
  D.destacado = elegirDestacado(ruta().id);
  D.eventos = [];
  if (D.destacado) {
    const ev = await sb.from('copa_eventos').select('*, copa_jugadores(nombre,dorsal)').eq('partido_id', D.destacado.id).order('creado_en', { ascending: false }).order('id', { ascending: false });
    D.eventos = ev.data || [];
  }
  if (D.config) {
    document.getElementById('marca').textContent = D.config.nombre;
    document.getElementById('sede').textContent = D.config.sede;
  }
  pintar();
}

function pintar() {
  const { r } = ruta();
  document.querySelectorAll('#nav a').forEach((a) => {
    const on = a.dataset.ruta === r;
    a.classList.toggle('activo', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.getElementById('titulo').textContent = { vivo: 'En vivo', posiciones: 'Posiciones', llaves: 'Llaves finales' }[r];
  $vista.innerHTML = r === 'vivo' ? vVivo() : r === 'posiciones' ? vPosiciones() : vLlaves();
  tic();
}

// ---------- EN VIVO ----------
function etiquetaPartido(p) {
  if (p.fase === 'grupos') return `Grupo ${esc(p.grupo || '')}${p.etiqueta ? ' · ' + esc(p.etiqueta) : ''}`;
  return esc(p.etiqueta || p.fase);
}

function vVivo() {
  const p = D.destacado;
  let html = '<div class="dos-col"><div class="col">';
  if (!p) {
    html += '<section class="tarjeta destacada"><p class="vacio">Aún no hay partidos en juego. Revisa la programación abajo.</p></section>';
  } else {
    const vivo = p.estado === 'en_juego';
    const chip = vivo
      ? '<span class="chip"><span class="punto vivo"></span>EN VIVO</span>'
      : p.estado === 'finalizado' ? '<span class="chip" style="background:#172133;color:#C9D2E0">FINALIZADO</span>' : '<span class="chip">PRÓXIMO</span>';
    const goles = D.eventos.filter((e) => e.tipo === 'gol' || e.tipo === 'autogol').reverse();
    const autor = (e) => `${esc(e.copa_jugadores?.nombre || 'Jugador')}${e.tipo === 'autogol' ? ' (a.g.)' : ''} ${e.minuto}'`;
    const aFavor = (e, lado) => (e.tipo === 'gol' ? e.equipo_id === lado : e.equipo_id !== lado);
    const golesL = goles.filter((e) => aFavor(e, p.local_id)).map((e) => `<span>${autor(e)}</span>`).join('');
    const golesV = goles.filter((e) => aFavor(e, p.visita_id)).map((e) => `<span>${autor(e)}</span>`).join('');
    const pen = p.penales_local != null && p.penales_visita != null ? `<span class="periodo">Penales ${p.penales_local}–${p.penales_visita}</span>` : '';
    html += `
    <section class="tarjeta destacada marcador" aria-label="Partido destacado">
      <div class="top">${chip}<span class="nota">${etiquetaPartido(p)}</span></div>
      <div class="equipos">
        <div class="lado"><div class="escudo local">${esc(corto(p.local_id, p.local_desc))}</div>${esc(nombre(p.local_id, p.local_desc))}</div>
        <div class="centro">
          <div class="goles"><span>${p.goles_local}</span><span class="guion">–</span><span>${p.goles_visita}</span></div>
          ${vivo && p.periodo !== 'Descanso' && p.periodo !== 'Penales' ? `<span class="minuto" data-reloj="${p.id}">${minuto(p)}'</span>` : ''}
          <span class="periodo">${vivo ? esc(PERIODOS[p.periodo] || p.periodo) : p.estado === 'finalizado' ? 'Final' : esc(fmtFecha(p.fecha_hora) + ' · ' + fmtHora(p.fecha_hora))}</span>
          ${pen}
        </div>
        <div class="lado"><div class="escudo">${esc(corto(p.visita_id, p.visita_desc))}</div>${esc(nombre(p.visita_id, p.visita_desc))}</div>
      </div>
      ${golesL || golesV ? `<div class="autores"><div>${golesL}</div><div>${golesV}</div></div>` : ''}
    </section>`;
    html += '<section class="seccion" aria-label="Minuto a minuto"><h2>Minuto a minuto</h2>';
    if (!D.eventos.length) html += '<p class="nota">Todavía no hay goles ni tarjetas.</p>';
    else html += '<ol class="jugadas">' + D.eventos.map((e) => `
      <li class="jugada"><span class="min">${e.minuto}'</span>${iconoJugada(e.tipo)}
        <span class="quien">${esc(e.copa_jugadores?.nombre || 'Jugador')}<small>${esc(nombre(e.equipo_id))} · ${e.automatica ? 'Roja por doble amarilla' : TEXTO_JUGADA[e.tipo]}</small></span><span></span></li>`).join('') + '</ol>';
    html += '</section>';
  }

  html += '</div><div class="col">';
  const prox = D.partidos.filter((x) => x.estado === 'programado' && (!p || x.id !== p.id)).slice(0, 6);
  html += '<section class="seccion" aria-label="Programación"><h2>Programación</h2>';
  html += prox.length ? '<div class="seccion">' + prox.map(filaPartido).join('') + '</div>' : '<p class="nota">No hay más partidos programados.</p>';
  html += '</section>';

  const res = D.partidos.filter((x) => x.estado === 'finalizado' && (!p || x.id !== p.id)).sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en)).slice(0, 8);
  if (res.length) html += '<section class="seccion" aria-label="Resultados"><h2>Resultados</h2><div class="seccion">' + res.map(filaPartido).join('') + '</div></section>';
  return html + '</div></div>';
}

function filaPartido(p) {
  const hoy = esHoy(p.fecha_hora);
  const cuando = p.estado === 'finalizado' ? 'Final' : p.estado === 'en_juego' ? 'En juego' : (hoy ? 'Hoy' : fmtFecha(p.fecha_hora));
  const hora = p.fecha_hora ? fmtHora(p.fecha_hora) : '';
  const g = ganador(p);
  const res = p.estado === 'programado'
    ? `<span class="res" style="font-family:inherit;font-size:12px;color:var(--gris);font-weight:500">${p.fase === 'grupos' ? 'Grupo ' + esc(p.grupo || '') : esc(p.etiqueta || '')}</span>`
    : `<span class="res"><span>${p.goles_local}</span><span>${p.goles_visita}</span></span>`;
  return `<a class="partido" href="#vivo/${p.id}" style="color:inherit">
    <span class="cuando ${hoy || p.estado === 'en_juego' ? 'hoy' : ''}">${esc(cuando)}<br>${esc(hora)}</span>
    <span class="nombres"><span class="${g && g === p.local_id ? 'ganador' : ''}">${esc(nombre(p.local_id, p.local_desc))}</span><span class="${g && g === p.visita_id ? 'ganador' : ''}">${esc(nombre(p.visita_id, p.visita_desc))}</span></span>
    ${res}</a>`;
}

// ---------- POSICIONES ----------
function vPosiciones() {
  const n = D.config?.clasifican_por_grupo ?? 2;
  const grupos = agruparTabla(D.tabla);
  let html = `<p class="nota">Pasan los ${n} primeros de cada grupo. La tabla se actualiza al pitazo final de cada partido.</p>`;
  if (!grupos.length) html += '<section class="tarjeta"><p class="vacio">Aún no hay equipos con grupo asignado.</p></section>';
  html += '<div class="grupos-grid">';
  grupos.forEach(({ grupo, filas }) => {
    const enJuego = D.partidos.filter((p) => p.fase === 'grupos' && p.grupo === grupo && p.estado === 'en_juego').length;
    html += `<section class="tarjeta" style="overflow:hidden">
      <div class="cab-tarjeta"><h2>Grupo ${esc(grupo)}</h2><span class="nota">${enJuego ? enJuego + ' partido en juego' : ''}</span></div>
      <table class="tabla"><thead><tr><th scope="col" class="eq" style="padding-left:14px">Equipo</th><th scope="col">PJ</th><th scope="col">G</th><th scope="col">E</th><th scope="col">P</th><th scope="col">DG</th><th scope="col" class="pts">PTS</th></tr></thead><tbody>
      ${filas.map((f, i) => `<tr class="${i < n ? 'clasifica' : ''}"><th scope="row" class="eq"><span><span class="barra"></span><span class="pos">${i + 1}</span>${esc(f.nombre)}</span></th>
        <td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td><td>${f.dg > 0 ? '+' + f.dg : f.dg}</td><td class="pts">${f.pts}</td></tr>`).join('')}
      </tbody></table></section>`;
  });
  html += '</div><section class="seccion goleadores-sec" aria-label="Goleadores"><h2>Goleadores</h2>';
  if (!D.goleadores.length) html += '<p class="nota">Todavía no hay goles.</p>';
  else {
    const [l, ...resto] = D.goleadores;
    html += `<div class="lider"><div class="copa">${ICONOS.copa}</div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11px;color:var(--acento);font-weight:700;letter-spacing:1px">LÍDER</span><span style="font-size:16px;font-weight:700">${esc(l.nombre)}</span><span class="nota">${esc(l.equipo)}</span></div><span class="num">${l.goles}</span></div>`;
    if (resto.length) html += '<ol class="goleadores tarjeta">' + resto.map((j, i) => `<li><span class="pos" style="font-family:var(--titulo);font-weight:700;color:var(--gris)">${i + 2}</span><span style="display:flex;flex-direction:column;min-width:0"><span style="font-size:14px;font-weight:600">${esc(j.nombre)}</span><span class="nota">${esc(j.equipo)}</span></span><span class="n">${j.goles}</span></li>`).join('') + '</ol>';
  }
  return html + '</section>';
}

// ---------- LLAVES ----------
function cruce(p) {
  const jugado = p.estado !== 'programado';
  const g = ganador(p);
  const fila = (id, desc, goles, pen) => `<div class="fila"><span class="${id ? '' : 'pend'} ${g && g === id ? 'ganador' : ''}">${esc(nombre(id, desc))}</span><b style="color:${jugado ? 'var(--texto)' : 'var(--apagado)'}">${jugado ? goles + (pen != null ? ` (${pen})` : '') : '–'}</b></div>`;
  return `<a class="tarjeta cruce" href="#vivo/${p.id}" style="color:inherit"><div class="et">${esc(p.etiqueta || 'Semifinal')} · ${p.fecha_hora ? esc(fmtFecha(p.fecha_hora) + ' ' + fmtHora(p.fecha_hora)) : 'Por definir'}</div>
    ${fila(p.local_id, p.local_desc, p.goles_local, p.penales_local)}${fila(p.visita_id, p.visita_desc, p.goles_visita, p.penales_visita)}</a>`;
}

function vLlaves() {
  const semis = D.partidos.filter((p) => p.fase === 'semifinal').sort((a, b) => (a.etiqueta || '').localeCompare(b.etiqueta || '') || a.id - b.id);
  const final = D.partidos.find((p) => p.fase === 'final');
  const tercero = D.partidos.find((p) => p.fase === 'tercer_puesto');
  if (!semis.length && !final) return '<section class="tarjeta"><p class="vacio">Las llaves se publican al terminar la fase de grupos.</p></section>';
  let html = '';
  if (semis.length) html += `<section class="seccion" aria-label="Semifinales"><h3 style="color:var(--gris)">Semifinales</h3><div class="llaves-semis">${semis.map(cruce).join('')}</div></section>`;
  if (final) {
    const jugado = final.estado !== 'programado';
    html += `<div style="display:flex;flex-direction:column;gap:0;margin-top:-10px"><div class="conector" aria-hidden="true"><div></div><div></div></div><div class="conector-v" aria-hidden="true"></div>
      <a class="tarjeta destacada final" href="#vivo/${final.id}" style="color:inherit">
        <div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:26px;color:var(--acento)">Gran final</h2><span class="nota">${final.fecha_hora ? esc(fmtFecha(final.fecha_hora) + ' · ' + fmtHora(final.fecha_hora)) : 'Fecha por definir'}</span></div>
        <div class="equipos" style="display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;text-align:center">
          <span class="lado"><span class="escudo local" style="width:54px;height:54px;font-size:18px">${esc(final.local_id ? corto(final.local_id) : '?')}</span>${esc(nombre(final.local_id, final.local_desc))}</span>
          <span class="goles" style="font-size:${jugado ? 44 : 22}px">${jugado ? `${final.goles_local}<span class="guion" style="font-size:28px">–</span>${final.goles_visita}` : '<span style="color:var(--apagado)">VS</span>'}</span>
          <span class="lado"><span class="escudo" style="width:54px;height:54px;font-size:18px">${esc(final.visita_id ? corto(final.visita_id) : '?')}</span>${esc(nombre(final.visita_id, final.visita_desc))}</span>
        </div>
        ${final.penales_local != null ? `<p class="nota" style="text-align:center">Penales ${final.penales_local}–${final.penales_visita}</p>` : '<p class="nota" style="text-align:center;border-top:1px solid var(--linea);padding-top:10px">Empate en el tiempo reglamentario: definición por penales</p>'}
      </a></div>`;
  }
  if (tercero) html += `<section class="seccion" aria-label="Tercer puesto"><h3 style="color:var(--gris)">Tercer puesto</h3>${cruce(tercero)}</section>`;
  const campeon = final ? ganador(final) : null;
  html += `<section class="campeon" aria-label="Campeón"><div class="copa" style="width:72px;height:72px;border-radius:20px;background:var(--acento);color:var(--fondo);display:flex;align-items:center;justify-content:center">${ICONOS.copa}</div>
    <span style="font-size:11px;font-weight:700;letter-spacing:2px;color:var(--acento)">CAMPEÓN</span>
    <span style="font-family:var(--titulo);font-weight:800;font-size:30px;text-transform:uppercase;color:${campeon ? 'var(--texto)' : 'var(--apagado)'}">${campeon ? esc(nombre(campeon)) : 'Por definir'}</span></section>`;
  return '<div class="llaves-wrap">' + html + '</div>';
}

// Reloj: actualiza el minuto cada segundo sin recargar
function tic() {
  document.querySelectorAll('[data-reloj]').forEach((el) => {
    const p = D.partidos.find((x) => x.id === Number(el.dataset.reloj));
    if (p) el.textContent = minuto(p) + "'";
  });
}
setInterval(tic, 1000);

const recargar = debounce(cargar, 400);
window.addEventListener('hashchange', () => { if (ruta().id || ruta().r === 'vivo') cargar(); else pintar(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { sincronizarHora(); recargar(); } });

sb.channel('copa-publico')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_partidos' }, recargar)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_eventos' }, recargar)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_equipos' }, recargar)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_jugadores' }, recargar)
  .subscribe();

// Respaldo por si el celular pierde la conexión en tiempo real
setInterval(() => { if (!document.hidden) recargar(); }, 30000);

await sincronizarHora();
cargar();
