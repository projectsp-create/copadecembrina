import { sb, esc, sincronizarHora, minuto, esHoy, fmtHora, fmtFecha, PERIODOS, ganador, agruparTabla, ICONOS, iconoJugada, TEXTO_JUGADA, debounce, aviso, explicarError,
  calcularSanciones, fairPlay, vallaMenosVencida, textoCuenta, estiloEscudo, colorEquipo, ordenPartidos } from './comun.js?v=1.5';

const D = { config: null, equipos: new Map(), jugadores: new Map(), partidos: [], tabla: [], goleadores: [], eventos: [], patrocinadores: [], destacado: null };
const $vista = document.getElementById('vista');
const RUTAS = ['vivo', 'posiciones', 'estadisticas', 'llaves', 'tv'];
const TITULOS = { vivo: 'En vivo', posiciones: 'Posiciones', estadisticas: 'Estadísticas', llaves: 'Llaves finales', tv: 'Pantalla grande' };

document.querySelectorAll('[data-ic]').forEach((el) => { el.outerHTML = ICONOS[el.dataset.ic]; });
document.getElementById('compartir').innerHTML = ICONOS.compartir;
document.getElementById('compartir').addEventListener('click', async () => {
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) await navigator.share({ title: document.title, url });
    else { await navigator.clipboard.writeText(url); aviso('Enlace copiado'); }
  } catch (e) { /* cancelado */ }
});

const eq = (id) => D.equipos.get(id);
const nombre = (id, desc) => (id && eq(id) ? eq(id).nombre : desc || 'Por definir');
const corto = (id, desc) => (id && eq(id) ? eq(id).corto : (desc || '?').slice(0, 3).toUpperCase());
const jug = (id) => D.jugadores.get(id);
const nomJug = (id) => jug(id)?.nombre || 'Jugador';
const escudo = (id, desc, extra = '') => `<div class="escudo" style="${id && eq(id) ? estiloEscudo(eq(id)) : ''};${extra}">${esc(corto(id, desc))}</div>`;

function ruta() {
  const [r, id] = (location.hash.replace('#', '') || 'vivo').split('/');
  return { r: RUTAS.includes(r) ? r : 'vivo', id: id ? Number(id) : null };
}

function elegirDestacado(idPedido) {
  if (idPedido) return D.partidos.find((p) => p.id === idPedido) || null;
  const enJuego = D.partidos.filter((p) => p.estado === 'en_juego').sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en));
  if (enJuego.length) return enJuego[0];
  const fin = D.partidos.filter((p) => p.estado === 'finalizado').sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en));
  return fin[0] || null;
}

function cuadroError(e) {
  return `<section class="tarjeta" style="padding:18px"><h2 style="color:var(--roja-texto)">No se pudo cargar</h2><p class="sub" style="margin-top:8px">${esc(explicarError(e))}</p></section>`;
}

async function cargar() {
  try { await cargarDatos(); } catch (e) { $vista.innerHTML = cuadroError(e); }
}
async function cargarDatos() {
  const [cfg, eqs, jus, pa, ta, go, ev, pat] = await Promise.all([
    sb.from('copa_config').select('*').eq('id', 1).maybeSingle(),
    sb.from('copa_equipos').select('id,nombre,corto,grupo,color'),
    sb.from('copa_jugadores').select('id,equipo_id,dorsal,nombre,suplente,es_arquero'),
    sb.from('copa_partidos').select('*').order('fecha_hora', { ascending: true, nullsFirst: false }).order('id'),
    sb.from('copa_tabla').select('*'),
    sb.from('copa_goleadores').select('*').order('goles', { ascending: false }).order('nombre').limit(20),
    sb.from('copa_eventos').select('id,partido_id,jugador_id,jugador_entra_id,equipo_id,tipo,minuto,automatica,creado_en').order('creado_en', { ascending: false }).order('id', { ascending: false }),
    sb.from('copa_patrocinadores').select('*').eq('activo', true).order('orden').order('id')
  ]);
  const err = [cfg, eqs, jus, pa, ta, go, ev].find((x) => x.error);
  if (err) { $vista.innerHTML = cuadroError(err.error); return; }
  D.config = cfg.data;
  D.equipos = new Map(eqs.data.map((e) => [e.id, e]));
  D.jugadores = new Map(jus.data.map((j) => [j.id, j]));
  D.partidos = pa.data;
  D.tabla = ta.data;
  D.goleadores = go.data;
  D.eventos = ev.data;
  D.patrocinadores = pat.error ? [] : pat.data;
  D.destacado = elegirDestacado(ruta().id);
  if (D.config) {
    document.getElementById('marca').textContent = D.config.nombre;
    document.getElementById('sede').textContent = D.config.sede;
  }
  pintar();
}

const eventosDe = (p) => (p ? D.eventos.filter((e) => e.partido_id === p.id) : []);

function pintar() {
  const { r } = ruta();
  document.body.classList.toggle('modo-tv', r === 'tv');
  document.querySelectorAll('#nav a').forEach((a) => {
    const on = a.dataset.ruta === r;
    a.classList.toggle('activo', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.getElementById('titulo').textContent = TITULOS[r];
  const vistas = { vivo: vVivo, posiciones: vPosiciones, estadisticas: vEstadisticas, llaves: vLlaves, tv: vTV };
  $vista.innerHTML = vistas[r]() + (r === 'tv' ? '' : franjaPatrocinadores());
  tic();
}

// ---------- Patrocinadores ----------
function franjaPatrocinadores(clase = '') {
  if (!D.patrocinadores.length) return '';
  return `<section class="patrocinadores ${clase}" aria-label="Patrocinadores"><span class="etq">Patrocinan</span><div class="logos">` +
    D.patrocinadores.map((p) => {
      const cont = p.logo_url ? `<img src="${esc(p.logo_url)}" alt="${esc(p.nombre)}" loading="lazy">` : `<span>${esc(p.nombre)}</span>`;
      return p.enlace ? `<a href="${esc(p.enlace)}" target="_blank" rel="noopener" class="patro">${cont}</a>` : `<span class="patro">${cont}</span>`;
    }).join('') + '</div></section>';
}

// ---------- EN VIVO ----------
function etiquetaPartido(p) {
  if (p.fase === 'grupos') return `Grupo ${esc(p.grupo || '')}${p.etiqueta ? ' · ' + esc(p.etiqueta) : ''}`;
  return esc(p.etiqueta || p.fase);
}

function textoWhatsApp(p) {
  const url = location.href.split('#')[0];
  const vivo = p.estado === 'en_juego';
  const estado = vivo ? (p.periodo === 'Descanso' ? 'Descanso' : `${minuto(p)}'`) : p.estado === 'finalizado' ? 'Final' : 'Próximo partido';
  return `⚽ ${D.config?.nombre || 'Copa Decembrina'}\n${nombre(p.local_id, p.local_desc)} ${p.goles_local} – ${p.goles_visita} ${nombre(p.visita_id, p.visita_desc)} · ${estado}\n${vivo ? 'Síguelo en vivo' : 'Resultados y tabla'}: ${url}`;
}

function lineaJugada(e) {
  if (e.tipo === 'cambio') {
    return `<li class="jugada"><span class="min">${e.minuto}'</span>${iconoJugada('cambio')}
      <span class="quien">Entra ${esc(nomJug(e.jugador_entra_id))}<small>Sale ${esc(nomJug(e.jugador_id))} · ${esc(nombre(e.equipo_id))}</small></span><span></span></li>`;
  }
  return `<li class="jugada"><span class="min">${e.minuto}'</span>${iconoJugada(e.tipo)}
    <span class="quien">${esc(nomJug(e.jugador_id))}<small>${esc(nombre(e.equipo_id))} · ${e.automatica ? 'Roja por doble amarilla' : TEXTO_JUGADA[e.tipo]}</small></span><span></span></li>`;
}

function marcadorGrande(p, evs) {
  const vivo = p.estado === 'en_juego';
  const chip = vivo
    ? '<span class="chip"><span class="punto vivo"></span>EN VIVO</span>'
    : p.estado === 'finalizado' ? '<span class="chip gris">FINALIZADO</span>' : '<span class="chip">PRÓXIMO</span>';
  const goles = evs.filter((e) => e.tipo === 'gol' || e.tipo === 'autogol').slice().reverse();
  const autor = (e) => `${esc(nomJug(e.jugador_id))}${e.tipo === 'autogol' ? ' (a.g.)' : ''} ${e.minuto}'`;
  const aFavor = (e, lado) => (e.tipo === 'gol' ? e.equipo_id === lado : e.equipo_id !== lado);
  const golesL = goles.filter((e) => aFavor(e, p.local_id)).map((e) => `<span>${autor(e)}</span>`).join('');
  const golesV = goles.filter((e) => aFavor(e, p.visita_id)).map((e) => `<span>${autor(e)}</span>`).join('');
  const pen = p.penales_local != null && p.penales_visita != null ? `<span class="periodo">Penales ${p.penales_local}–${p.penales_visita}</span>` : '';
  const conReloj = vivo && p.periodo !== 'Descanso' && p.periodo !== 'Penales';
  let estado;
  if (vivo) estado = esc(PERIODOS[p.periodo] || p.periodo);
  else if (p.estado === 'finalizado') estado = 'Final';
  else estado = `${esc(fmtFecha(p.fecha_hora))} · ${esc(fmtHora(p.fecha_hora))}${p.fecha_hora ? `<br><b data-cuenta="${p.fecha_hora}">${esc(textoCuenta(p.fecha_hora))}</b>` : ''}`;
  return `
    <div class="top">${chip}<span class="nota">${etiquetaPartido(p)}</span></div>
    <div class="equipos">
      <div class="lado">${escudo(p.local_id, p.local_desc)}${esc(nombre(p.local_id, p.local_desc))}</div>
      <div class="centro">
        <div class="goles"><span>${p.goles_local}</span><span class="guion">–</span><span>${p.goles_visita}</span></div>
        ${conReloj ? `<span class="minuto" data-reloj="${p.id}">${minuto(p)}'</span>` : ''}
        <span class="periodo">${estado}</span>
        ${pen}
      </div>
      <div class="lado">${escudo(p.visita_id, p.visita_desc)}${esc(nombre(p.visita_id, p.visita_desc))}</div>
    </div>
    ${golesL || golesV ? `<div class="autores"><div>${golesL}</div><div>${golesV}</div></div>` : ''}`;
}

function proximo() {
  return D.partidos.filter((x) => x.estado === 'programado').sort(ordenPartidos)[0] || null;
}

function vVivo() {
  const p = D.destacado;
  const evs = eventosDe(p);
  let html = '<div class="dos-col"><div class="col">';
  if (!p) {
    const pr = proximo();
    html += `<section class="tarjeta destacada marcador">${pr ? marcadorGrande(pr, []) : '<p class="vacio">Aún no hay partidos programados.</p>'}</section>`;
  } else {
    html += `<section class="tarjeta destacada marcador" aria-label="Partido destacado">${marcadorGrande(p, evs)}
      <div class="acciones-pub">
        <a class="btn chico" href="https://wa.me/?text=${encodeURIComponent(textoWhatsApp(p))}" target="_blank" rel="noopener">${ICONOS.whatsapp}Compartir por WhatsApp</a>
        <a class="btn chico" href="#tv">${ICONOS.tv}Pantalla grande</a>
      </div></section>`;
    html += '<section class="seccion" aria-label="Minuto a minuto"><h2>Minuto a minuto</h2>';
    html += evs.length ? '<ol class="jugadas">' + evs.map(lineaJugada).join('') + '</ol>' : '<p class="nota">Todavía no hay goles, tarjetas ni cambios.</p>';
    html += '</section>';
  }
  html += '</div><div class="col">';
  const prox = D.partidos.filter((x) => x.estado === 'programado' && (!p || x.id !== p.id)).sort(ordenPartidos).slice(0, 6);
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
  const futuro = p.estado === 'programado' && p.fecha_hora && new Date(p.fecha_hora) > new Date();
  const res = p.estado === 'programado'
    ? `<span class="res-texto">${p.fase === 'grupos' ? 'Grupo ' + esc(p.grupo || '') : esc(p.etiqueta || '')}${futuro ? `<br><b data-cuenta="${p.fecha_hora}">${esc(textoCuenta(p.fecha_hora))}</b>` : ''}</span>`
    : `<span class="res"><span>${p.goles_local}</span><span>${p.goles_visita}</span></span>`;
  const punto = (id) => `<i class="color-eq" style="background:${id && eq(id) ? colorEquipo(eq(id)) : 'var(--borde-2)'}"></i>`;
  return `<a class="partido" href="#vivo/${p.id}">
    <span class="cuando ${hoy || p.estado === 'en_juego' ? 'hoy' : ''}">${esc(cuando)}<br>${esc(hora)}</span>
    <span class="nombres"><span class="${g && g === p.local_id ? 'ganador' : ''}">${punto(p.local_id)}${esc(nombre(p.local_id, p.local_desc))}</span><span class="${g && g === p.visita_id ? 'ganador' : ''}">${punto(p.visita_id)}${esc(nombre(p.visita_id, p.visita_desc))}</span></span>
    ${res}</a>`;
}

// ---------- POSICIONES ----------
function vPosiciones() {
  const n = D.config?.clasifican_por_grupo ?? 2;
  const grupos = agruparTabla(D.tabla, D.config?.desempate, D.partidos);
  let html = `<p class="nota">Pasan los ${n} primeros de cada grupo. La tabla se actualiza al pitazo final de cada partido.</p>`;
  if (!grupos.length) return html + '<section class="tarjeta"><p class="vacio">Aún no hay equipos con grupo asignado.</p></section>';
  html += '<div class="grupos-grid">';
  grupos.forEach(({ grupo, filas }) => {
    const enJuego = D.partidos.filter((p) => p.fase === 'grupos' && p.grupo === grupo && p.estado === 'en_juego').length;
    html += `<section class="tarjeta" style="overflow:hidden">
      <div class="cab-tarjeta"><h2>Grupo ${esc(grupo)}</h2><span class="nota">${enJuego ? enJuego + ' partido en juego' : ''}</span></div>
      <table class="tabla"><thead><tr><th scope="col" class="eq" style="padding-left:14px">Equipo</th><th scope="col">PJ</th><th scope="col">G</th><th scope="col">E</th><th scope="col">P</th><th scope="col">DG</th><th scope="col" class="pts">PTS</th></tr></thead><tbody>
      ${filas.map((f, i) => `<tr class="${i < n ? 'clasifica' : ''}"><th scope="row" class="eq"><span><span class="barra"></span><span class="pos">${i + 1}</span><i class="color-eq" style="background:${colorEquipo(eq(f.equipo_id))}"></i>${esc(f.nombre)}</span></th>
        <td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td><td>${f.dg > 0 ? '+' + f.dg : f.dg}</td><td class="pts">${f.pts}</td></tr>`).join('')}
      </tbody></table></section>`;
  });
  return html + '</div>';
}

// ---------- ESTADÍSTICAS ----------
function vEstadisticas() {
  let html = '<div class="dos-col"><div class="col">';
  // Goleadores
  html += '<section class="seccion" aria-label="Goleadores"><h2>Goleadores</h2>';
  if (!D.goleadores.length) html += '<p class="nota">Todavía no hay goles.</p>';
  else {
    const [l, ...resto] = D.goleadores;
    html += `<div class="lider"><div class="copa">${ICONOS.copa}</div><div style="display:flex;flex-direction:column;gap:2px"><span class="etq-lider">LÍDER</span><span style="font-size:16px;font-weight:700">${esc(l.nombre)}</span><span class="nota">${esc(l.equipo)}</span></div><span class="num">${l.goles}</span></div>`;
    if (resto.length) html += '<ol class="goleadores tarjeta">' + resto.map((j, i) => `<li><span class="pos">${i + 2}</span><span style="display:flex;flex-direction:column;min-width:0"><span style="font-size:14px;font-weight:600">${esc(j.nombre)}</span><span class="nota">${esc(j.equipo)}</span></span><span class="n">${j.goles}</span></li>`).join('') + '</ol>';
  }
  html += '</section>';
  // Valla menos vencida
  const valla = vallaMenosVencida(D.tabla, [...D.jugadores.values()]);
  html += '<section class="seccion" aria-label="Valla menos vencida"><h2>Valla menos vencida</h2>';
  html += valla.length
    ? '<ol class="goleadores tarjeta">' + valla.slice(0, 8).map((v, i) => `<li><span class="pos">${i + 1}</span><span style="display:flex;flex-direction:column;min-width:0"><span style="font-size:14px;font-weight:600">${esc(v.arqueros.join(' / ') || 'Arquero sin marcar')}</span><span class="nota">${esc(v.nombre)} · ${v.pj} PJ · ${v.promedio.toFixed(2)} por partido</span></span><span class="n">${v.gc}</span></li>`).join('') + '</ol>'
    : '<p class="nota">Se calcula cuando terminen los primeros partidos.</p>';
  html += '</section></div><div class="col">';
  // Sanciones
  const sanc = calcularSanciones({ partidos: D.partidos, eventos: D.eventos, jugadores: [...D.jugadores.values()], config: D.config });
  html += '<section class="seccion" aria-label="Suspendidos"><h2>Suspendidos</h2>';
  html += sanc.lista.length
    ? '<ul class="jugadas">' + sanc.lista.map((s) => `<li class="jugada"><span class="min" style="font-size:14px">${esc(corto(s.jugador.equipo_id))}</span>${iconoJugada(/Roja/.test(s.motivo) ? 'roja' : 'amarilla')}
        <span class="quien">${esc(s.jugador.nombre)}<small>${esc(s.motivo)} · no juega: ${s.partidos.map((p) => esc(nombre(p.local_id === s.jugador.equipo_id ? p.visita_id : p.local_id, p.local_id === s.jugador.equipo_id ? p.visita_desc : p.local_desc)) + (p.fecha_hora ? ' (' + esc(fmtFecha(p.fecha_hora)) + ')' : '')).join(', ')}${s.sinCrear > 0 ? (s.partidos.length ? ' y ' : '') + (s.sinCrear > 1 ? s.sinCrear + ' partidos más' : 'su próximo partido') : ''}</small></span><span></span></li>`).join('') + '</ul>'
    : '<p class="nota">No hay jugadores suspendidos.</p>';
  const K = D.config?.amarillas_suspension ?? 3, R = D.config?.roja_fechas ?? 1;
  html += `<p class="nota">Reglamento: roja = ${R} fecha${R > 1 ? 's' : ''} de suspensión${K > 0 ? ` · cada ${K} amarillas acumuladas = 1 fecha` : ''}.</p></section>`;
  // Fair play
  const fp = fairPlay(D.eventos, [...D.equipos.values()]);
  html += `<section class="tarjeta" style="overflow:hidden" aria-label="Juego limpio"><div class="cab-tarjeta"><h2>Juego limpio</h2><span class="nota">Menos puntos = más limpio</span></div>
    <table class="tabla"><thead><tr><th scope="col" class="eq" style="padding-left:14px">Equipo</th><th scope="col"><span class="tarjeta-am" role="img" aria-label="Amarillas" style="width:10px;height:14px"></span></th><th scope="col"><span class="tarjeta-ro" role="img" aria-label="Rojas" style="width:10px;height:14px"></span></th><th scope="col" class="pts">PTS</th></tr></thead><tbody>
    ${fp.map((f, i) => `<tr class="${i === 0 ? 'clasifica' : ''}"><th scope="row" class="eq"><span><span class="barra"></span><span class="pos">${i + 1}</span><i class="color-eq" style="background:${colorEquipo(f.equipo)}"></i>${esc(f.equipo.nombre)}</span></th><td>${f.amarillas}</td><td>${f.rojas}</td><td class="pts">${f.puntos}</td></tr>`).join('')}
    </tbody></table><p class="nota" style="padding:10px 14px">Amarilla 1 punto · Roja directa 3 · Roja por doble amarilla 1 (más sus dos amarillas)</p></section>`;
  return html + '</div></div>';
}

// ---------- LLAVES ----------
function cruce(p) {
  const jugado = p.estado !== 'programado';
  const g = ganador(p);
  const fila = (id, desc, goles, pen) => `<div class="fila"><span class="${id ? '' : 'pend'} ${g && g === id ? 'ganador' : ''}">${esc(nombre(id, desc))}</span><b style="color:${jugado ? 'var(--texto)' : 'var(--apagado)'}">${jugado ? goles + (pen != null ? ` (${pen})` : '') : '–'}</b></div>`;
  return `<a class="tarjeta cruce" href="#vivo/${p.id}"><div class="et">${esc(p.etiqueta || 'Semifinal')} · ${p.fecha_hora ? esc(fmtFecha(p.fecha_hora) + ' ' + fmtHora(p.fecha_hora)) : 'Por definir'}</div>
    ${fila(p.local_id, p.local_desc, p.goles_local, p.penales_local)}${fila(p.visita_id, p.visita_desc, p.goles_visita, p.penales_visita)}</a>`;
}

function vLlaves() {
  const semis = D.partidos.filter((p) => p.fase === 'semifinal').sort((a, b) => (a.etiqueta || '').localeCompare(b.etiqueta || '') || a.id - b.id);
  const final = D.partidos.find((p) => p.fase === 'final');
  const tercero = D.partidos.find((p) => p.fase === 'tercer_puesto');
  if (!semis.length && !final) return '<section class="tarjeta"><p class="vacio">Las llaves se publican al terminar la fase de grupos.</p></section>';
  let html = '';
  if (semis.length) html += `<section class="seccion" aria-label="Semifinales"><h3 class="gris">Semifinales</h3><div class="llaves-semis">${semis.map(cruce).join('')}</div></section>`;
  if (final) {
    const jugado = final.estado !== 'programado';
    html += `<div style="display:flex;flex-direction:column;margin-top:-10px"><div class="conector" aria-hidden="true"><div></div><div></div></div><div class="conector-v" aria-hidden="true"></div>
      <a class="tarjeta destacada final" href="#vivo/${final.id}">
        <div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:26px;color:var(--acento)">Gran final</h2><span class="nota">${final.fecha_hora ? esc(fmtFecha(final.fecha_hora) + ' · ' + fmtHora(final.fecha_hora)) : 'Fecha por definir'}</span></div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;text-align:center">
          <span class="lado">${escudo(final.local_id, '?', 'width:54px;height:54px;font-size:18px')}${esc(nombre(final.local_id, final.local_desc))}</span>
          <span class="goles" style="font-size:${jugado ? 44 : 22}px">${jugado ? `${final.goles_local}<span class="guion" style="font-size:28px">–</span>${final.goles_visita}` : '<span style="color:var(--apagado)">VS</span>'}</span>
          <span class="lado">${escudo(final.visita_id, '?', 'width:54px;height:54px;font-size:18px')}${esc(nombre(final.visita_id, final.visita_desc))}</span>
        </div>
        ${final.penales_local != null ? `<p class="nota" style="text-align:center">Penales ${final.penales_local}–${final.penales_visita}</p>` : '<p class="nota" style="text-align:center;border-top:1px solid var(--linea);padding-top:10px">Empate en el tiempo reglamentario: definición por penales</p>'}
        ${!jugado && final.fecha_hora ? `<p class="nota" style="text-align:center"><b data-cuenta="${final.fecha_hora}">${esc(textoCuenta(final.fecha_hora))}</b></p>` : ''}
      </a></div>`;
  }
  if (tercero) html += `<section class="seccion" aria-label="Tercer puesto"><h3 class="gris">Tercer puesto</h3>${cruce(tercero)}</section>`;
  const campeon = final ? ganador(final) : null;
  html += `<section class="campeon" aria-label="Campeón"><div class="copa-grande">${ICONOS.copa}</div>
    <span class="etq-lider" style="letter-spacing:2px">CAMPEÓN</span>
    <span style="font-family:var(--titulo);font-weight:800;font-size:30px;text-transform:uppercase;color:${campeon ? colorEquipo(eq(campeon)) : 'var(--apagado)'}">${campeon ? esc(nombre(campeon)) : 'Por definir'}</span></section>`;
  return '<div class="llaves-wrap">' + html + '</div>';
}

// ---------- MODO PANTALLA GRANDE (TV) ----------
function vTV() {
  const p = D.destacado || proximo();
  const evs = eventosDe(p).slice(0, 5);
  const pr = D.partidos.filter((x) => x.estado === 'programado' && (!p || x.id !== p.id)).sort(ordenPartidos)[0];
  return `<div class="tv">
    <div class="tv-cab"><span class="marca">${esc(D.config?.nombre || 'Copa Decembrina')}</span><a class="btn chico" href="#vivo">Salir de pantalla grande</a></div>
    ${p ? `<section class="tarjeta destacada marcador tv-marcador">${marcadorGrande(p, eventosDe(p))}</section>` : '<p class="vacio">No hay partidos.</p>'}
    <div class="tv-abajo">
      <section class="seccion">${evs.length ? '<h2>Últimas jugadas</h2><ol class="jugadas">' + evs.map(lineaJugada).join('') + '</ol>' : ''}</section>
      <section class="seccion">${pr ? `<h2>Siguiente partido</h2>${filaPartido(pr)}` : ''}</section>
    </div>
    ${franjaPatrocinadores('tv-patro')}
  </div>`;
}

// Reloj y cuentas regresivas: se actualizan cada segundo sin recargar
function tic() {
  document.querySelectorAll('[data-reloj]').forEach((el) => {
    const p = D.partidos.find((x) => x.id === Number(el.dataset.reloj));
    if (p) el.textContent = minuto(p) + "'";
  });
  document.querySelectorAll('[data-cuenta]').forEach((el) => { el.textContent = textoCuenta(el.dataset.cuenta); });
}
setInterval(tic, 1000);

const recargar = debounce(cargar, 400);
window.addEventListener('hashchange', () => { D.destacado = elegirDestacado(ruta().id); pintar(); window.scrollTo(0, 0); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ruta().r === 'tv') location.hash = '#vivo'; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { sincronizarHora(); recargar(); } });

sb.channel('copa-publico')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_partidos' }, recargar)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_eventos' }, recargar)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_equipos' }, recargar)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_patrocinadores' }, recargar)
  .subscribe();

// Respaldo por si el celular pierde la conexión en tiempo real
setInterval(() => { if (!document.hidden) recargar(); }, 30000);

await sincronizarHora();
cargar();
