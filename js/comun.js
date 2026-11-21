import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=1.4';

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

export function ordenarTabla(filas) {
  return [...filas].sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.nombre.localeCompare(b.nombre, 'es'));
}
export function agruparTabla(filas) {
  const grupos = {};
  filas.filter((f) => f.grupo).forEach((f) => { (grupos[f.grupo] ||= []).push(f); });
  return Object.keys(grupos).sort().map((g) => ({ grupo: g, filas: ordenarTabla(grupos[g]) }));
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
  llave: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>'
};

export function iconoJugada(tipo) {
  if (tipo === 'gol' || tipo === 'autogol') return `<span class="ic" role="img" aria-label="${tipo === 'gol' ? 'Gol' : 'Autogol'}">${ICONOS.balon}</span>`;
  if (tipo === 'amarilla') return '<span class="ic"><span class="tarjeta-am" role="img" aria-label="Tarjeta amarilla"></span></span>';
  return '<span class="ic"><span class="tarjeta-ro" role="img" aria-label="Tarjeta roja"></span></span>';
}
export const TEXTO_JUGADA = { gol: '¡Gol!', autogol: 'Autogol', amarilla: 'Amarilla', roja: 'Roja' };

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
