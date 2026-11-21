import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=1.5';

if (!SUPABASE_URL || SUPABASE_URL.includes('TU-PROYECTO') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('PEGA_AQUI')) {
  throw new Error('Falta poner la URL y la key de Supabase en js/config.js (en GitHub).');
}
export const sb = createClient(SUPABASE_URL.trim().replace(/\/+$/, ''), SUPABASE_ANON_KEY.trim());

// Traduce errores típicos a algo entendible
export function explicarError(e) {
  const m = (e && (e.message || e.details)) || String(e);
  if (/does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(m)) return 'La base de datos no tiene las tablas. Corre el archivo supabase/01_esquema.sql en Supabase → SQL Editor.';
  if (/Invalid API key|No API key|JWT|apikey/i.test(m)) return 'La key de js/config.js no es válida. Copia de nuevo la publishable key completa.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No hay conexión con Supabase. Revisa internet y que la URL de js/config.js esté bien escrita.';
  return m;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Diferencia entre el reloj del celular y el del servidor
let desfase = 0;
export async function sincronizarHora() {
  const t0 = Date.now();
  const { data, error } = await sb.rpc('copa_ahora');
  if (!error && data) desfase = new Date(data).getTime() - (t0 + Date.now()) / 2;
}
export const ahora = () => Date.now() + desfase;

export function segundos(p) {
  let s = p.reloj_base || 0;
  if (p.reloj_desde) s += Math.floor((ahora() - new Date(p.reloj_desde).getTime()) / 1000);
  return Math.max(0, s);
}
export const minuto = (p) => Math.floor(segundos(p) / 60) + 1;
export function mmss(p) {
  const s = segundos(p);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

const ZONA = 'America/Bogota';
const diaClave = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: ZONA });
export const esHoy = (d) => d && diaClave(d) === diaClave(ahora());
export function fmtHora(d) {
  if (!d) return 'Por definir';
  return new Date(d).toLocaleTimeString('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' });
}
export function fmtFecha(d) {
  if (!d) return 'Por definir';
  return new Date(d).toLocaleDateString('es-CO', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' });
}
// "2026-12-12T15:00" (hora Colombia) -> ISO
export const desdeLocal = (v) => (v ? new Date(v + ':00-05:00').toISOString() : null);
export function aLocal(d) {
  if (!d) return '';
  const f = new Date(new Date(d).getTime() - 5 * 3600 * 1000);
  return f.toISOString().slice(0, 16);
}

export const PERIODOS = { '1T': '1er tiempo', 'Descanso': 'Descanso', '2T': '2º tiempo', 'Penales': 'Penales', 'Final': 'Final' };
export const FASES = { grupos: 'Fase de grupos', semifinal: 'Semifinal', tercer_puesto: 'Tercer puesto', final: 'Final' };

export function ganador(p) {
  if (p.estado !== 'finalizado' || !p.local_id || !p.visita_id) return null;
  if (p.goles_local !== p.goles_visita) return p.goles_local > p.goles_visita ? p.local_id : p.visita_id;
  if (p.penales_local != null && p.penales_visita != null && p.penales_local !== p.penales_visita)
    return p.penales_local > p.penales_visita ? p.local_id : p.visita_id;
  return null;
}
export function perdedor(p) {
  const g = ganador(p);
  if (!g) return null;
  return g === p.local_id ? p.visita_id : p.local_id;
}

// ---------- Tabla con desempate configurable ----------
// criterios: 'pts,dg,gf,directo' (directo = resultado entre los equipos empatados)
function puntosDirectos(a, b, partidos) {
  let pa = 0, pb = 0;
  partidos.filter((p) => p.fase === 'grupos' && p.estado === 'finalizado'
    && ((p.local_id === a && p.visita_id === b) || (p.local_id === b && p.visita_id === a))).forEach((p) => {
    const ga = p.local_id === a ? p.goles_local : p.goles_visita;
    const gb = p.local_id === a ? p.goles_visita : p.goles_local;
    if (ga > gb) pa += 3; else if (gb > ga) pb += 3; else { pa++; pb++; }
  });
  return pb - pa;
}
export function ordenarTabla(filas, criterios = 'pts,dg,gf,directo', partidos = []) {
  const lista = String(criterios || 'pts,dg,gf,directo').split(',').map((x) => x.trim());
  return [...filas].sort((a, b) => {
    for (const c of lista) {
      let d = 0;
      if (c === 'pts') d = b.pts - a.pts;
      else if (c === 'dg') d = b.dg - a.dg;
      else if (c === 'gf') d = b.gf - a.gf;
      else if (c === 'directo') d = puntosDirectos(a.equipo_id, b.equipo_id, partidos);
      if (d) return d;
    }
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}
export function agruparTabla(filas, criterios, partidos) {
  const grupos = {};
  filas.filter((f) => f.grupo).forEach((f) => { (grupos[f.grupo] ||= []).push(f); });
  return Object.keys(grupos).sort().map((g) => ({ grupo: g, filas: ordenarTabla(grupos[g], criterios, partidos) }));
}
export const DESEMPATES = {
  'pts,dg,gf,directo': 'Puntos → diferencia de gol → goles a favor → partido entre ellos',
  'pts,directo,dg,gf': 'Puntos → partido entre ellos → diferencia de gol → goles a favor',
  'pts,gf,dg,directo': 'Puntos → goles a favor → diferencia de gol → partido entre ellos'
};

// ---------- Orden de partidos de un equipo ----------
export function ordenPartidos(a, b) {
  const fa = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Infinity;
  const fb = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Infinity;
  return fa - fb || a.id - b.id;
}

// ---------- Sanciones (suspensiones automáticas) ----------
// Roja = N fechas (config.roja_fechas). Cada K amarillas acumuladas = 1 fecha (config.amarillas_suspension).
// Las amarillas del partido donde vio roja por doble amarilla no se acumulan.
export function calcularSanciones({ partidos, eventos, jugadores, config }) {
  const K = Number(config?.amarillas_suspension ?? 3);
  const R = Number(config?.roja_fechas ?? 1);
  const suspendido = new Map();   // jugador_id -> Set(partido_id)
  const lista = [];               // sanciones con partidos pendientes
  const acumuladas = new Map();   // jugador_id -> amarillas que lleva
  const porJugador = new Map();
  eventos.forEach((e) => {
    if (!e.jugador_id || (e.tipo !== 'amarilla' && e.tipo !== 'roja')) return;
    if (!porJugador.has(e.jugador_id)) porJugador.set(e.jugador_id, []);
    porJugador.get(e.jugador_id).push(e);
  });
  jugadores.forEach((j) => {
    const evs = porJugador.get(j.id);
    if (!evs) return;
    const delEquipo = partidos.filter((p) => p.local_id === j.equipo_id || p.visita_id === j.equipo_id).sort(ordenPartidos);
    let acum = 0;
    delEquipo.forEach((p, i) => {
      if (p.estado !== 'finalizado') return;
      const ev = evs.filter((e) => e.partido_id === p.id);
      if (!ev.length) return;
      const roja = ev.find((e) => e.tipo === 'roja');
      let fechas = 0, motivo = '';
      if (roja) { fechas = R; motivo = roja.automatica ? 'Roja por doble amarilla' : 'Roja directa'; }
      else {
        acum += ev.filter((e) => e.tipo === 'amarilla').length;
        if (K > 0 && acum >= K) { fechas = 1; acum -= K; motivo = `${K} amarillas acumuladas`; }
      }
      if (!fechas) return;
      const siguientes = delEquipo.slice(i + 1, i + 1 + fechas);
      if (!suspendido.has(j.id)) suspendido.set(j.id, new Set());
      siguientes.forEach((s) => suspendido.get(j.id).add(s.id));
      const pendientes = siguientes.filter((s) => s.estado !== 'finalizado');
      const sinCrear = fechas - siguientes.length;
      if (pendientes.length || sinCrear > 0) lista.push({ jugador: j, motivo, partidos: pendientes, sinCrear });
    });
    acumuladas.set(j.id, acum);
  });
  return { suspendido, lista, acumuladas };
}
export const estaSuspendido = (sanciones, jugadorId, partidoId) => !!sanciones?.suspendido.get(jugadorId)?.has(partidoId);

// ---------- Fair play (menos puntos = más limpio) ----------
// Amarilla 1 punto · Roja directa 3 · Roja por doble amarilla 1 (las dos amarillas ya suman)
export function fairPlay(eventos, equipos) {
  const t = new Map(equipos.map((e) => [e.id, { equipo: e, amarillas: 0, rojas: 0, puntos: 0 }]));
  eventos.forEach((e) => {
    const f = t.get(e.equipo_id);
    if (!f) return;
    if (e.tipo === 'amarilla') { f.amarillas++; f.puntos += 1; }
    if (e.tipo === 'roja') { f.rojas++; f.puntos += e.automatica ? 1 : 3; }
  });
  return [...t.values()].sort((a, b) => a.puntos - b.puntos || a.equipo.nombre.localeCompare(b.equipo.nombre, 'es'));
}

// ---------- Valla menos vencida ----------
export function vallaMenosVencida(tabla, jugadores) {
  return tabla.filter((f) => f.pj > 0).map((f) => ({
    ...f,
    promedio: f.gc / f.pj,
    arqueros: jugadores.filter((j) => j.equipo_id === f.equipo_id && j.es_arquero).map((j) => j.nombre)
  })).sort((a, b) => a.promedio - b.promedio || a.gc - b.gc || b.pj - a.pj);
}

// ---------- Cuenta regresiva ----------
export function textoCuenta(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - ahora();
  if (ms <= 0) return 'Por empezar';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `Empieza en ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return `Empieza en ${h} h${m ? ' ' + m + ' min' : ''}`;
  const d = Math.floor(h / 24);
  return `Faltan ${d} día${d > 1 ? 's' : ''}`;
}

// ---------- Colores de barras ----------
export function colorEquipo(eq) { return (eq && /^#[0-9a-f]{6}$/i.test(eq.color || '')) ? eq.color : '#0A78C2'; }
export function estiloEscudo(eq) {
  const c = colorEquipo(eq);
  return `border-color:${c};background:${c}1A;color:${c}`;
}

export const ICONOS = {
  balon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5L7 18.5M8 10L3.5 8.5"/></svg>',
  vivo: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8"/></svg>',
  tabla: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  llaves: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h5v6H3M3 13h5v6H3M8 8h4v8H8M12 12h4M16 9h5v6h-5z"/></svg>',
  copa: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4"/></svg>',
  compartir: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  deshacer: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
  basura: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  pito: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v3h6V3M9 11h6M9 15h4"/></svg>',
  equipos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0M16 4a3 3 0 010 6M21 20a6 6 0 00-4-5.6"/></svg>',
  calendario: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  cambio: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v14M3 14l4 4 4-4"/><path d="M17 20V6M13 10l4-4 4 4"/></svg>',
  tv: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  estadisticas: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-1.5-1-2-2l1-1-1-2z"/></svg>',
  descargar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  reportes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>',
  llave: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>'
};

export function iconoJugada(tipo) {
  if (tipo === 'cambio') return `<span class="ic ic-cambio" role="img" aria-label="Cambio">${ICONOS.cambio}</span>`;
  if (tipo === 'gol' || tipo === 'autogol') return `<span class="ic" role="img" aria-label="${tipo === 'gol' ? 'Gol' : 'Autogol'}">${ICONOS.balon}</span>`;
  if (tipo === 'amarilla') return '<span class="ic"><span class="tarjeta-am" role="img" aria-label="Tarjeta amarilla"></span></span>';
  return '<span class="ic"><span class="tarjeta-ro" role="img" aria-label="Tarjeta roja"></span></span>';
}
export const TEXTO_JUGADA = { gol: '¡Gol!', autogol: 'Autogol', amarilla: 'Amarilla', roja: 'Roja', cambio: 'Cambio' };

let tAviso;
export function aviso(msg, error = false) {
  let el = document.getElementById('aviso');
  if (!el) { el = document.createElement('div'); el.id = 'aviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.className = 'aviso' + (error ? ' error' : '');
  el.textContent = msg;
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.remove(), 3200);
}

export function debounce(fn, ms = 350) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
