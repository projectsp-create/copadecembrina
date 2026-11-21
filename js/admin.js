import { sb, esc, sincronizarHora, segundos, minuto, mmss, fmtFecha, fmtHora, desdeLocal, aLocal, PERIODOS, FASES, ganador, perdedor, agruparTabla, ICONOS, iconoJugada, TEXTO_JUGADA, aviso, debounce, explicarError } from './comun.js?v=1.3';

const $vista = document.getElementById('vista');
const $nav = document.getElementById('nav');

const A = {
  session: null, yo: null, tab: null,
  config: null, equipos: [], jugadores: [], partidos: [], admins: [], eventos: [],
  pl: { partidoId: null, lado: 'local', sel: null },
  abiertos: new Set()
};

// ---------- Permisos (espejo de la base; la base es la que manda) ----------
const esDueno = () => A.yo?.rol === 'dueno';
function puede(p) {
  if (!A.yo) return false;
  if (esDueno()) return true;
  return { planillar: A.yo.puede_planillar, editar_equipos: A.yo.puede_editar_equipos, gestionar_partidos: A.yo.puede_gestionar_partidos, corregir_cerrados: A.yo.puede_corregir_cerrados }[p] || false;
}
const TABS = [
  { id: 'planillero', label: 'Planillero', ic: 'pito', ok: () => puede('planillar') || puede('corregir_cerrados') },
  { id: 'equipos', label: 'Equipos', ic: 'equipos', ok: () => puede('editar_equipos') },
  { id: 'partidos', label: 'Partidos', ic: 'calendario', ok: () => puede('gestionar_partidos') },
  { id: 'admins', label: 'Permisos', ic: 'llave', ok: () => esDueno() }
];

const eq = (id) => A.equipos.find((e) => e.id === id);
const nom = (id, desc) => eq(id)?.nombre || desc || 'Por definir';
const cor = (id, desc) => eq(id)?.corto || desc || '?';
const iniciales = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

async function q(promesa, ok) {
  const { data, error } = await promesa;
  if (error) { aviso(traducirError(error), true); console.error(error); return null; }
  if (ok) aviso(ok);
  return data ?? true;
}
function traducirError(e) {
  const m = e.message || String(e);
  if (/row-level security|permission|permiso/i.test(m)) return 'No tienes permiso para hacer eso.';
  if (/duplicate key/i.test(m)) return 'Ese registro ya existe.';
  return explicarError(e);
}

// ---------- Sesión ----------
async function iniciar() {
  await sincronizarHora();
  const { data } = await sb.auth.getSession();
  A.session = data.session;
  sb.auth.onAuthStateChange((_e, s) => {
    const antes = A.session?.user?.email;
    A.session = s;
    if ((s?.user?.email || null) !== (antes || null)) arrancar();
  });
  arrancar();
}

async function arrancar() {
  if (!A.session) return pintarLogin();
  const email = A.session.user.email.toLowerCase();
  const { data, error } = await sb.from('copa_admins').select('*').eq('email', email).maybeSingle();
  if (error) { $vista.innerHTML = `<section class="tarjeta" style="padding:18px"><h2 style="color:var(--roja-texto)">No se pudo cargar</h2><p class="sub" style="margin-top:8px">${esc(explicarError(error))}</p><button class="btn ancho" style="margin-top:12px" data-accion="salir">Salir</button></section>`; return; }
  A.yo = data;
  if (!A.yo) return pintarNoAutorizado(email);
  A.tab = A.tab || TABS.find((t) => t.ok())?.id;
  await cargarTodo();
  suscribir();
  pintar();
}

function pintarLogin() {
  $nav.classList.add('oculto');
  $vista.innerHTML = `
  <section class="tarjeta destacada login">
    <span class="marca">Copa Decembrina</span>
    <div class="lider" style="background:var(--acento);border:none;padding:14px;border-radius:18px;color:var(--fondo)">${ICONOS.pito}</div>
    <h1>Acceso planillero</h1>
    <p class="sub">Solo el dueño y los administradores autorizados. El público ve todo sin iniciar sesión.</p>
    <form id="formLogin" style="width:100%;display:flex;flex-direction:column;gap:12px;text-align:left">
      <div class="campo"><label for="lgEmail">Correo</label><input id="lgEmail" class="input" type="email" autocomplete="username" required></div>
      <div class="campo"><label for="lgClave">Contraseña</label><input id="lgClave" class="input" type="password" autocomplete="current-password" required></div>
      <button class="btn primario ancho" type="submit" style="min-height:52px">Entrar</button>
    </form>
    <a href="./" class="nota">Ir a la página pública</a>
  </section>`;
}

function pintarNoAutorizado(email) {
  $nav.classList.add('oculto');
  $vista.innerHTML = `<section class="tarjeta login"><h1>Sin acceso</h1>
    <p class="sub">El correo <b>${esc(email)}</b> no está autorizado como administrador de la Copa. Pídele al dueño que te agregue.</p>
    <button class="btn ancho" data-accion="salir">Salir</button><a href="./" class="nota">Ir a la página pública</a></section>`;
}

// ---------- Datos ----------
async function cargarTodo() {
  const [cfg, e, j, p, ad] = await Promise.all([
    sb.from('copa_config').select('*').eq('id', 1).maybeSingle(),
    sb.from('copa_equipos').select('*').order('grupo', { nullsFirst: false }).order('nombre'),
    sb.from('copa_jugadores').select('*').order('suplente').order('dorsal', { nullsFirst: false }).order('nombre'),
    sb.from('copa_partidos').select('*').order('fecha_hora', { ascending: true, nullsFirst: false }).order('id'),
    esDueno() ? sb.from('copa_admins').select('*').order('rol', { ascending: false }).order('nombre') : Promise.resolve({ data: [] })
  ]);
  A.config = cfg.data; A.equipos = e.data || []; A.jugadores = j.data || []; A.partidos = p.data || []; A.admins = ad.data || [];
  if (!A.pl.partidoId) {
    const vivo = A.partidos.find((x) => x.estado === 'en_juego') || A.partidos.find((x) => x.estado === 'programado');
    A.pl.partidoId = vivo?.id || null;
  }
  await cargarEventos();
}
async function cargarEventos() {
  if (!A.pl.partidoId) { A.eventos = []; return; }
  const { data } = await sb.from('copa_eventos').select('*').eq('partido_id', A.pl.partidoId).order('creado_en', { ascending: false }).order('id', { ascending: false });
  A.eventos = data || [];
}

let canal;
function suscribir() {
  if (canal) return;
  const refrescar = debounce(async () => {
    await cargarTodo();
    if (A.tab === 'planillero') pintar();
  }, 300);
  canal = sb.channel('copa-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_partidos' }, refrescar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'copa_eventos' }, refrescar)
    .subscribe();
}

// ---------- Pintar ----------
function pintar() {
  const tabs = TABS.filter((t) => t.ok());
  $nav.classList.remove('oculto');
  $nav.style.setProperty('--cols', tabs.length);
  $nav.innerHTML = tabs.map((t) => `<button data-accion="tab" data-id="${t.id}" class="${A.tab === t.id ? 'activo' : ''}" ${A.tab === t.id ? 'aria-current="page"' : ''}>${ICONOS[t.ic]}${t.label}</button>`).join('');
  const cab = `<div class="usuario"><span class="avatar">${esc(iniciales(A.yo.nombre))}</span><span class="datos">${esc(A.yo.nombre)}<small>${esDueno() ? 'Dueño' : 'Administrador'}</small></span><a class="btn chico" href="./" target="_blank" rel="noopener">Ver web</a><button class="btn chico" data-accion="salir">Salir</button></div>
  <details class="tarjeta"><summary style="cursor:pointer;padding:12px 14px;font-size:13px;color:var(--gris)">Cambiar mi contraseña</summary>
    <form id="formClave" style="padding:0 14px 14px;display:flex;flex-direction:column;gap:10px">
      <div class="campo"><label for="nvClave">Nueva contraseña</label><input id="nvClave" class="input" type="password" autocomplete="new-password"></div>
      <div class="campo"><label for="nvClave2">Repítela</label><input id="nvClave2" class="input" type="password" autocomplete="new-password"></div>
      <button class="btn primario" type="submit">Guardar contraseña</button>
    </form></details>`;
  const cuerpo = { planillero: vPlanillero, equipos: vEquipos, partidos: vPartidos, admins: vAdmins }[A.tab]?.() || '';
  $vista.innerHTML = cab + cuerpo;
  tic();
}

const partidoActual = () => A.partidos.find((p) => p.id === A.pl.partidoId);
const etiquetaP = (p) => `${p.fase === 'grupos' ? 'Gr. ' + (p.grupo || '') + (p.etiqueta ? ' · ' + p.etiqueta : '') : (p.etiqueta || FASES[p.fase])}: ${cor(p.local_id, p.local_desc)} vs ${cor(p.visita_id, p.visita_desc)}`;

// ---------- PLANILLERO ----------
function vPlanillero() {
  const lista = A.partidos.filter((p) => p.estado !== 'finalizado' || puede('corregir_cerrados'));
  let h = `<section class="campo"><label for="selPartido">Partido</label>
    <select id="selPartido" class="input" data-cambio="partido">
      <option value="">Elige un partido…</option>
      ${lista.map((p) => `<option value="${p.id}" ${p.id === A.pl.partidoId ? 'selected' : ''}>${p.estado === 'en_juego' ? '● ' : p.estado === 'finalizado' ? '✓ ' : ''}${esc(etiquetaP(p))}</option>`).join('')}
    </select></section>`;
  const p = partidoActual();
  if (!p) return h + '<p class="vacio">Elige un partido para empezar a planillar.</p>';
  if (!p.local_id || !p.visita_id) return h + '<p class="vacio">Este partido todavía no tiene los dos equipos definidos. Asígnalos en la pestaña Partidos.</p>';

  const fin = p.estado === 'finalizado';
  const bloqueado = fin && !puede('corregir_cerrados');
  const corriendo = !!p.reloj_desde;

  h += `<section class="tarjeta pad destacada" style="display:flex;flex-direction:column;gap:12px" aria-label="Marcador y reloj">
    <div class="reloj-panel">
      <span class="eq">${esc(nom(p.local_id))}<b>${p.goles_local}</b></span>
      <span class="centro" style="display:flex;flex-direction:column;align-items:center;gap:6px">
        <b data-reloj-admin style="color:${corriendo ? 'var(--texto)' : 'var(--gris)'}">${mmss(p)}</b>
        ${p.estado === 'programado'
          ? '<button class="btn primario chico" data-accion="reloj" data-a="iniciar">Iniciar partido</button>'
          : fin ? '<span class="chip" style="background:#172133;color:#C9D2E0">FINALIZADO</span>'
          : `<button class="btn chico ${corriendo ? '' : 'primario'}" data-accion="reloj" data-a="${corriendo ? 'pausar' : 'iniciar'}">${corriendo ? 'Pausar' : 'Reanudar'}</button>`}
      </span>
      <span class="eq">${esc(nom(p.visita_id))}<b>${p.goles_visita}</b></span>
    </div>
    ${p.estado === 'en_juego' ? `
    <div class="ajuste" style="justify-content:center"><button class="btn chico" data-accion="ajustar" data-s="-60" aria-label="Restar un minuto">−1'</button><button class="btn chico" data-accion="ajustar" data-s="60" aria-label="Sumar un minuto">+1'</button></div>
    <div class="segmentos" role="group" aria-label="Periodo" style="--n:4">
      ${['1T', 'Descanso', '2T', 'Penales'].map((x) => `<button data-accion="periodo" data-p="${x}" aria-pressed="${p.periodo === x}">${x}</button>`).join('')}
    </div>` : ''}
    ${p.periodo === 'Penales' || p.penales_local != null ? `
    <div class="fila-campos">
      <div class="campo"><label for="penL">Penales ${esc(cor(p.local_id))}</label><input id="penL" class="input" type="number" min="0" inputmode="numeric" value="${p.penales_local ?? ''}" data-cambio="penales" data-campo="penales_local"></div>
      <div class="campo"><label for="penV">Penales ${esc(cor(p.visita_id))}</label><input id="penV" class="input" type="number" min="0" inputmode="numeric" value="${p.penales_visita ?? ''}" data-cambio="penales" data-campo="penales_visita"></div>
    </div>` : ''}
  </section>`;

  if (bloqueado) return h + '<p class="vacio">Este partido ya se cerró. Solo quien tenga el permiso "Corregir partidos cerrados" puede modificarlo.</p>' + vRegistradas(p, false);

  // Paso 1: jugador
  const ladoId = A.pl.lado === 'local' ? p.local_id : p.visita_id;
  const plantilla = A.jugadores.filter((j) => j.equipo_id === ladoId && j.activo);
  h += `<section class="seccion" aria-label="Elegir jugador"><h2><span style="color:var(--acento)">1.</span> Elige el jugador</h2>
    <div class="pestanas" role="tablist" aria-label="Equipo">
      ${['local', 'visita'].map((k) => `<button role="tab" data-accion="lado" data-lado="${k}" aria-selected="${A.pl.lado === k}">${esc(nom(k === 'local' ? p.local_id : p.visita_id))}</button>`).join('')}
    </div>`;
  if (!plantilla.length) h += '<p class="nota">Este equipo no tiene jugadores cargados. Agrégalos en la pestaña Equipos.</p>';
  h += '<div class="plantilla">' + plantilla.map((j) => {
    const ev = A.eventos.filter((e) => e.jugador_id === j.id);
    const g = ev.filter((e) => e.tipo === 'gol').length;
    const exp = ev.some((e) => e.tipo === 'roja');
    const am = !exp && ev.some((e) => e.tipo === 'amarilla');
    const on = A.pl.sel === j.id;
    return `<button class="jug ${exp ? 'expulsado' : ''}" data-accion="sel" data-id="${j.id}" aria-pressed="${on}" ${exp ? 'disabled' : ''}>
      <span class="dorsal">${j.dorsal ?? '–'}</span>
      <span class="info">${esc(j.nombre)}<span class="marcas">
        ${g ? `<span class="g"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg> ${g}</span>` : ''}${am ? '<span class="tarjeta-am" role="img" aria-label="Amonestado"></span>' : ''}${exp ? '<span class="tarjeta-ro" role="img" aria-label="Expulsado"></span><span style="color:var(--roja-texto)">Expulsado</span>' : ''}${j.suplente && !ev.length ? 'Suplente' : ''}
      </span></span></button>`;
  }).join('') + '</div></section>';

  // Paso 2: qué hizo
  const sel = A.jugadores.find((j) => j.id === A.pl.sel);
  h += `<section class="tarjeta pad ${sel ? 'destacada' : ''}" style="display:flex;flex-direction:column;gap:10px" aria-label="Registrar jugada">
    <h2><span style="color:var(--acento)">2.</span> ¿Qué hizo o recibió? · <span style="color:var(--acento)" data-min-admin>${minuto(p)}'</span></h2>
    <p class="nota" style="color:${sel ? 'var(--texto)' : 'var(--gris)'}">${sel ? `Seleccionado: ${sel.dorsal ?? ''} · ${esc(sel.nombre)} (${esc(cor(sel.equipo_id))})` : 'Primero toca un jugador de la lista.'}</p>
    <div class="acciones">
      <button class="a-gol" data-accion="jugada" data-tipo="gol" ${sel ? '' : 'disabled'}>${ICONOS.balon}GOL</button>
      <button class="a-auto" data-accion="jugada" data-tipo="autogol" ${sel ? '' : 'disabled'}>Autogol</button>
      <button class="a-am" data-accion="jugada" data-tipo="amarilla" ${sel ? '' : 'disabled'}><span class="tarjeta-am" aria-hidden="true"></span>Amarilla</button>
      <button class="a-ro" data-accion="jugada" data-tipo="roja" ${sel ? '' : 'disabled'}><span class="tarjeta-ro" aria-hidden="true"></span>Roja</button>
    </div>
    <p class="nota">La segunda amarilla pone la roja automáticamente.</p>
  </section>`;

  h += vRegistradas(p, true);
  h += fin
    ? '<button class="btn contorno ancho" data-accion="reabrir">REABRIR PARTIDO</button>'
    : (p.estado === 'en_juego' ? '<button class="btn contorno ancho" style="min-height:56px" data-accion="finalizar">FINALIZAR PARTIDO</button>' : '');
  return h;
}

function vRegistradas(p, editable) {
  const jn = (id) => A.jugadores.find((j) => j.id === id);
  let h = `<section class="seccion" aria-label="Jugadas registradas"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Registradas</h2>
    ${editable && A.eventos.length ? `<button class="btn chico" data-accion="deshacer">${ICONOS.deshacer}Deshacer última</button>` : ''}</div>`;
  if (!A.eventos.length) return h + '<p class="nota">Aún no hay jugadas en este partido.</p></section>';
  h += '<ol class="jugadas">' + A.eventos.map((e) => {
    const j = jn(e.jugador_id);
    return `<li class="jugada"><span class="min">${e.minuto}'</span>${iconoJugada(e.tipo)}
      <span class="quien">${esc(j ? (j.dorsal ?? '') + ' · ' + j.nombre : 'Jugador')}<small>${e.automatica ? 'Roja por doble amarilla' : TEXTO_JUGADA[e.tipo]} · ${esc(cor(e.equipo_id))}</small></span>
      ${editable && !e.automatica ? `<button class="icono-btn" data-accion="borrarJugada" data-id="${e.id}" aria-label="Borrar esta jugada">${ICONOS.basura}</button>` : '<span></span>'}</li>`;
  }).join('') + '</ol></section>';
  return h;
}

// ---------- EQUIPOS ----------
function vEquipos() {
  let h = `<section class="tarjeta pad seccion" aria-label="Nuevo equipo"><h2>Nuevo equipo</h2>
    <div class="campo"><label for="nEqNombre">Nombre</label><input id="nEqNombre" class="input" placeholder="Hinchas Atlético Huila"></div>
    <div class="fila-campos">
      <div class="campo"><label for="nEqCorto">Sigla (3 letras)</label><input id="nEqCorto" class="input" maxlength="4" placeholder="HUI"></div>
      <div class="campo"><label for="nEqGrupo">Grupo</label><input id="nEqGrupo" class="input" maxlength="2" placeholder="A"></div>
    </div>
    <button class="btn primario" data-accion="crearEquipo">Agregar equipo</button></section>`;
  if (!A.equipos.length) return h + '<p class="vacio">Todavía no hay equipos.</p>';
  h += `<section class="seccion"><h2>Equipos y jugadores</h2><p class="nota">Toca un equipo para ver y editar su plantilla. Los cambios en jugadores se guardan al salir de cada casilla.</p><div class="tarjeta">`;
  h += A.equipos.map((e) => {
    const js = A.jugadores.filter((j) => j.equipo_id === e.id);
    return `<details class="equipo" data-eq="${e.id}" ${A.abiertos.has(e.id) ? 'open' : ''}>
      <summary><span class="avatar gris">${esc(e.corto)}</span><span class="datos">${esc(e.nombre)}<small>Grupo ${esc(e.grupo || '—')} · ${js.length} jugadores</small></span><span aria-hidden="true">▾</span></summary>
      <div class="cuerpo">
        <div class="campo"><label for="eqN${e.id}">Nombre</label><input id="eqN${e.id}" class="input" value="${esc(e.nombre)}"></div>
        <div class="fila-campos">
          <div class="campo"><label for="eqC${e.id}">Sigla</label><input id="eqC${e.id}" class="input" maxlength="4" value="${esc(e.corto)}"></div>
          <div class="campo"><label for="eqG${e.id}">Grupo</label><input id="eqG${e.id}" class="input" maxlength="2" value="${esc(e.grupo || '')}"></div>
        </div>
        <div style="display:flex;gap:8px"><button class="btn chico primario" data-accion="guardarEquipo" data-id="${e.id}">Guardar equipo</button><button class="btn chico peligro" data-accion="borrarEquipo" data-id="${e.id}">Borrar equipo</button></div>
        <h3 style="margin-top:6px">Plantilla</h3>
        <div class="fila-jug etq" aria-hidden="true"><span>Dorsal</span><span>Nombre</span><span>Sup.</span><span></span></div>
        ${js.map((j) => `<div class="fila-jug">
          <input class="input" type="number" inputmode="numeric" aria-label="Dorsal de ${esc(j.nombre)}" value="${j.dorsal ?? ''}" data-cambio="jug" data-id="${j.id}" data-campo="dorsal">
          <input class="input" aria-label="Nombre del jugador ${j.dorsal ?? ''}" value="${esc(j.nombre)}" data-cambio="jug" data-id="${j.id}" data-campo="nombre">
          <label class="sup"><input type="checkbox" ${j.suplente ? 'checked' : ''} data-cambio="jug" data-id="${j.id}" data-campo="suplente">Sup.</label>
          <button class="icono-btn" data-accion="borrarJugador" data-id="${j.id}" aria-label="Quitar a ${esc(j.nombre)}">${ICONOS.basura}</button>
        </div>`).join('')}
        <div class="fila-campos tres">
          <div class="campo"><label for="nJD${e.id}">Dorsal</label><input id="nJD${e.id}" class="input" type="number" inputmode="numeric"></div>
          <div class="campo"><label for="nJN${e.id}">Nuevo jugador</label><input id="nJN${e.id}" class="input" placeholder="Nombre y apellido"></div>
          <button class="btn primario" data-accion="crearJugador" data-id="${e.id}">Agregar</button>
        </div>
        <div class="campo"><label for="lista${e.id}">Agregar varios (uno por línea: dorsal y nombre; pon * al final si es suplente)</label>
          <textarea id="lista${e.id}" class="input" placeholder="1 Luis Cuenca&#10;7 Carlos Rojas&#10;12 Mario Silva *"></textarea></div>
        <button class="btn" data-accion="crearLista" data-id="${e.id}">Agregar lista</button>
      </div></details>`;
  }).join('');
  return h + '</div></section>';
}

// ---------- PARTIDOS ----------
function opcionesEquipos(sel) {
  return '<option value="">— Por definir —</option>' + A.equipos.map((e) => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('');
}
function vPartidos() {
  const c = A.config || {};
  let h = `<section class="tarjeta pad seccion" aria-label="Datos del torneo"><h2>Torneo</h2>
    <div class="campo"><label for="cfNombre">Nombre</label><input id="cfNombre" class="input" value="${esc(c.nombre)}"></div>
    <div class="campo"><label for="cfSede">Sede</label><input id="cfSede" class="input" value="${esc(c.sede)}"></div>
    <div class="campo"><label for="cfClas">Clasifican por grupo</label><input id="cfClas" class="input" type="number" min="1" value="${c.clasifican_por_grupo ?? 2}"></div>
    <button class="btn primario" data-accion="guardarConfig">Guardar</button></section>

  <section class="tarjeta pad seccion" aria-label="Herramientas"><h2>Armar el torneo</h2>
    <button class="btn" data-accion="fixture">Generar fixture de grupos (todos contra todos)</button>
    <button class="btn" data-accion="semis">Armar semifinales desde la tabla (1A–2B, 1B–2A)</button>
    <button class="btn" data-accion="finales">Pasar ganadores a la final y al 3er puesto</button>
    <p class="nota">El fixture no duplica partidos que ya existan. Las horas se ponen abajo en cada partido.</p></section>

  <section class="tarjeta pad seccion" aria-label="Nuevo partido"><h2>Nuevo partido</h2>
    <div class="fila-campos">
      <div class="campo"><label for="npFase">Fase</label><select id="npFase" class="input">${Object.entries(FASES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="npGrupo">Grupo</label><input id="npGrupo" class="input" maxlength="2" placeholder="A"></div>
    </div>
    <div class="fila-campos">
      <div class="campo"><label for="npEtq">Etiqueta</label><input id="npEtq" class="input" placeholder="Fecha 1 / Semi 1"></div>
      <div class="campo"><label for="npFecha">Fecha y hora</label><input id="npFecha" class="input" type="datetime-local"></div>
    </div>
    <div class="fila-campos">
      <div class="campo"><label for="npL">Local</label><select id="npL" class="input">${opcionesEquipos(null)}</select></div>
      <div class="campo"><label for="npV">Visitante</label><select id="npV" class="input">${opcionesEquipos(null)}</select></div>
    </div>
    <div class="fila-campos">
      <div class="campo"><label for="npLD">Texto si no hay local</label><input id="npLD" class="input" placeholder="1º Grupo A"></div>
      <div class="campo"><label for="npVD">Texto si no hay visitante</label><input id="npVD" class="input" placeholder="2º Grupo B"></div>
    </div>
    <button class="btn primario" data-accion="crearPartido">Crear partido</button></section>`;

  Object.entries(FASES).forEach(([fase, titulo]) => {
    const ps = A.partidos.filter((p) => p.fase === fase);
    if (!ps.length) return;
    h += `<section class="seccion"><h2>${titulo}</h2><div class="tarjeta"><ul class="lista-admin">` + ps.map((p) => `<li>
      <div class="cabeza"><span class="datos">${esc(p.fase === 'grupos' ? 'Grupo ' + (p.grupo || '') + ' · ' + (p.etiqueta || '') : p.etiqueta || titulo)}
        <small>${p.estado === 'finalizado' ? `Final ${p.goles_local}–${p.goles_visita}` : p.estado === 'en_juego' ? 'En juego' : 'Programado'}${p.fecha_hora ? ' · ' + esc(fmtFecha(p.fecha_hora) + ' ' + fmtHora(p.fecha_hora)) : ''}</small></span>
        <button class="icono-btn" data-accion="borrarPartido" data-id="${p.id}" aria-label="Borrar partido">${ICONOS.basura}</button></div>
      <div class="fila-campos">
        <select class="input" aria-label="Local" data-cambio="partidoCampo" data-id="${p.id}" data-campo="local_id">${opcionesEquipos(p.local_id)}</select>
        <select class="input" aria-label="Visitante" data-cambio="partidoCampo" data-id="${p.id}" data-campo="visita_id">${opcionesEquipos(p.visita_id)}</select>
      </div>
      <input class="input" type="datetime-local" aria-label="Fecha y hora" value="${aLocal(p.fecha_hora)}" data-cambio="partidoCampo" data-id="${p.id}" data-campo="fecha_hora">
    </li>`).join('') + '</ul></div></section>';
  });
  return h;
}

// ---------- PERMISOS (solo dueño) ----------
const PERMISOS = [
  ['puede_planillar', 'Planillar partidos'],
  ['puede_editar_equipos', 'Editar equipos y jugadores'],
  ['puede_gestionar_partidos', 'Crear partidos y llaves'],
  ['puede_corregir_cerrados', 'Corregir partidos cerrados']
];
function vAdmins() {
  let h = `<section class="seccion"><h2>Quién puede administrar</h2><p class="nota">Solo tú, como dueño, puedes agregar, quitar y cambiar permisos. Primero crea su usuario en Supabase (Authentication → Users → Add user) y luego agrégalo aquí con el mismo correo.</p><div class="tarjeta"><ul class="lista-admin">`;
  h += A.admins.map((a) => `<li>
    <div class="cabeza"><span class="avatar ${a.rol === 'dueno' ? '' : 'gris'}">${esc(iniciales(a.nombre))}</span><span class="datos">${esc(a.nombre)}<small>${esc(a.email)}</small></span>
      ${a.rol === 'dueno' ? '<span class="etiqueta-rol">Dueño</span>' : `<button class="btn chico peligro" data-accion="quitarAdmin" data-email="${esc(a.email)}">Quitar</button>`}</div>
    ${a.rol === 'dueno' ? '<p class="nota">Tiene todos los permisos.</p>' : `<div class="permisos">${PERMISOS.map(([k, t]) => `<label class="check"><input type="checkbox" ${a[k] ? 'checked' : ''} data-cambio="perm" data-email="${esc(a.email)}" data-campo="${k}">${t}</label>`).join('')}</div>`}
  </li>`).join('');
  h += `</ul></div></section>
  <section class="tarjeta pad seccion" aria-label="Agregar administrador"><h2>Agregar administrador</h2>
    <div class="campo"><label for="adEmail">Correo (el mismo del usuario creado en Supabase)</label><input id="adEmail" class="input" type="email" placeholder="nombre@gmail.com" autocomplete="off"></div>
    <div class="campo"><label for="adNombre">Nombre</label><input id="adNombre" class="input" placeholder="Nombre para mostrar"></div>
    <div class="permisos">${PERMISOS.map(([k, t], i) => `<label class="check"><input type="checkbox" id="adP${i}" data-campo="${k}" ${i < 2 ? 'checked' : ''}>${t}</label>`).join('')}</div>
    <button class="btn primario" data-accion="agregarAdmin">Agregar</button></section>`;
  return h;
}

// ---------- Reloj en pantalla ----------
function tic() {
  const p = partidoActual();
  if (!p || A.tab !== 'planillero') return;
  const r = document.querySelector('[data-reloj-admin]');
  if (r) r.textContent = mmss(p);
  const m = document.querySelector('[data-min-admin]');
  if (m) m.textContent = minuto(p) + "'";
}
setInterval(tic, 1000);

// ---------- Acciones ----------
const val = (id) => document.getElementById(id)?.value.trim() ?? '';
async function refrescar() { await cargarTodo(); pintar(); }

function roundRobin(ids) {
  const t = [...ids];
  if (t.length % 2) t.push(null);
  const n = t.length, fechas = [];
  for (let r = 0; r < n - 1; r++) {
    const f = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) f.push(r % 2 ? [b, a] : [a, b]); }
    fechas.push(f);
    t.splice(1, 0, t.pop());
  }
  return fechas;
}

const ACCIONES = {
  salir: async () => { await sb.auth.signOut(); A.yo = null; pintarLogin(); },
  tab: (b) => { A.tab = b.dataset.id; pintar(); window.scrollTo(0, 0); },

  // Planillero
  lado: (b) => { A.pl.lado = b.dataset.lado; A.pl.sel = null; pintar(); },
  sel: (b) => { const id = Number(b.dataset.id); A.pl.sel = A.pl.sel === id ? null : id; pintar(); },
  reloj: async (b) => { if (await q(sb.rpc('copa_reloj', { p_partido: A.pl.partidoId, p_accion: b.dataset.a }))) refrescar(); },
  ajustar: async (b) => {
    const p = partidoActual();
    if (await q(sb.rpc('copa_reloj', { p_partido: p.id, p_accion: 'fijar', p_segundos: segundos(p) + Number(b.dataset.s) }))) refrescar();
  },
  periodo: async (b) => {
    const p = partidoActual(), per = b.dataset.p;
    if (per === 'Descanso' || per === 'Penales') await q(sb.rpc('copa_reloj', { p_partido: p.id, p_accion: 'pausar' }));
    if (per === '2T' && segundos(p) < 45 * 60) await q(sb.rpc('copa_reloj', { p_partido: p.id, p_accion: 'fijar', p_segundos: 45 * 60 }));
    if (await q(sb.from('copa_partidos').update({ periodo: per }).eq('id', p.id))) refrescar();
  },
  jugada: async (b) => {
    const p = partidoActual();
    const j = A.jugadores.find((x) => x.id === A.pl.sel);
    if (!p || !j) return;
    const tipo = b.dataset.tipo;
    const ok = await q(sb.from('copa_eventos').insert({ partido_id: p.id, jugador_id: j.id, equipo_id: j.equipo_id, tipo, minuto: minuto(p) }),
      `${TEXTO_JUGADA[tipo]} · ${j.nombre}`);
    if (ok) { A.pl.sel = null; await cargarEventos(); await cargarTodo(); pintar(); }
  },
  deshacer: async () => {
    const ult = A.eventos.find((e) => !e.automatica);
    if (!ult) return;
    if (await q(sb.from('copa_eventos').delete().eq('id', ult.id), 'Jugada borrada')) refrescar();
  },
  borrarJugada: async (b) => {
    if (!confirm('¿Borrar esta jugada?')) return;
    if (await q(sb.from('copa_eventos').delete().eq('id', Number(b.dataset.id)), 'Jugada borrada')) refrescar();
  },
  finalizar: async () => {
    const p = partidoActual();
    if (!confirm(`¿Finalizar ${cor(p.local_id)} ${p.goles_local} – ${p.goles_visita} ${cor(p.visita_id)}? La tabla se actualiza al cerrar.`)) return;
    await q(sb.rpc('copa_reloj', { p_partido: p.id, p_accion: 'pausar' }));
    if (await q(sb.from('copa_partidos').update({ estado: 'finalizado', periodo: 'Final' }).eq('id', p.id), 'Partido finalizado')) refrescar();
  },
  reabrir: async () => {
    const p = partidoActual();
    if (!confirm('¿Reabrir este partido para corregirlo?')) return;
    if (await q(sb.from('copa_partidos').update({ estado: 'en_juego', periodo: '2T' }).eq('id', p.id), 'Partido reabierto')) refrescar();
  },

  // Equipos
  crearEquipo: async () => {
    const nombre = val('nEqNombre'), corto = val('nEqCorto').toUpperCase(), grupo = val('nEqGrupo').toUpperCase() || null;
    if (!nombre || !corto) return aviso('Pon nombre y sigla', true);
    if (await q(sb.from('copa_equipos').insert({ nombre, corto, grupo }), 'Equipo agregado')) refrescar();
  },
  guardarEquipo: async (b) => {
    const id = Number(b.dataset.id);
    const datos = { nombre: val('eqN' + id), corto: val('eqC' + id).toUpperCase(), grupo: val('eqG' + id).toUpperCase() || null };
    if (await q(sb.from('copa_equipos').update(datos).eq('id', id), 'Equipo guardado')) refrescar();
  },
  borrarEquipo: async (b) => {
    const e = eq(Number(b.dataset.id));
    if (!confirm(`¿Borrar ${e.nombre} con todos sus jugadores? Sus partidos quedan sin ese equipo.`)) return;
    if (await q(sb.from('copa_equipos').delete().eq('id', e.id), 'Equipo borrado')) refrescar();
  },
  crearJugador: async (b) => {
    const id = Number(b.dataset.id), nombre = val('nJN' + id), d = val('nJD' + id);
    if (!nombre) return aviso('Escribe el nombre', true);
    if (await q(sb.from('copa_jugadores').insert({ equipo_id: id, nombre, dorsal: d ? Number(d) : null }), 'Jugador agregado')) refrescar();
  },
  crearLista: async (b) => {
    const id = Number(b.dataset.id);
    const filas = val('lista' + id).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const sup = /\*\s*$/.test(l);
      const limpio = l.replace(/\*\s*$/, '').trim();
      const m = limpio.match(/^(\d+)[\s.\-–]+(.+)$/);
      return { equipo_id: id, dorsal: m ? Number(m[1]) : null, nombre: (m ? m[2] : limpio).trim(), suplente: sup };
    });
    if (!filas.length) return aviso('La lista está vacía', true);
    if (await q(sb.from('copa_jugadores').insert(filas), `${filas.length} jugadores agregados`)) refrescar();
  },
  borrarJugador: async (b) => {
    const j = A.jugadores.find((x) => x.id === Number(b.dataset.id));
    if (!confirm(`¿Quitar a ${j.nombre} de la plantilla?`)) return;
    if (await q(sb.from('copa_jugadores').delete().eq('id', j.id), 'Jugador quitado')) refrescar();
  },

  // Partidos
  guardarConfig: async () => {
    const datos = { nombre: val('cfNombre'), sede: val('cfSede'), clasifican_por_grupo: Number(val('cfClas')) || 2 };
    if (await q(sb.from('copa_config').update(datos).eq('id', 1), 'Datos del torneo guardados')) refrescar();
  },
  crearPartido: async () => {
    const datos = {
      fase: val('npFase'), grupo: val('npGrupo').toUpperCase() || null, etiqueta: val('npEtq') || null,
      fecha_hora: desdeLocal(val('npFecha')), local_id: Number(val('npL')) || null, visita_id: Number(val('npV')) || null,
      local_desc: val('npLD') || null, visita_desc: val('npVD') || null
    };
    if (datos.local_id && datos.local_id === datos.visita_id) return aviso('Local y visitante no pueden ser el mismo', true);
    if (await q(sb.from('copa_partidos').insert(datos), 'Partido creado')) refrescar();
  },
  borrarPartido: async (b) => {
    if (!confirm('¿Borrar este partido y todas sus jugadas?')) return;
    if (await q(sb.from('copa_partidos').delete().eq('id', Number(b.dataset.id)), 'Partido borrado')) refrescar();
  },
  fixture: async () => {
    const grupos = [...new Set(A.equipos.map((e) => e.grupo).filter(Boolean))].sort();
    if (!grupos.length) return aviso('Primero asigna grupo a los equipos', true);
    const existe = (a, b) => A.partidos.some((p) => p.fase === 'grupos' && ((p.local_id === a && p.visita_id === b) || (p.local_id === b && p.visita_id === a)));
    const nuevos = [];
    grupos.forEach((g) => {
      roundRobin(A.equipos.filter((e) => e.grupo === g).map((e) => e.id)).forEach((fecha, i) => {
        fecha.forEach(([a, b]) => { if (!existe(a, b)) nuevos.push({ fase: 'grupos', grupo: g, etiqueta: 'Fecha ' + (i + 1), local_id: a, visita_id: b }); });
      });
    });
    if (!nuevos.length) return aviso('El fixture ya estaba completo');
    if (await q(sb.from('copa_partidos').insert(nuevos), `${nuevos.length} partidos creados`)) refrescar();
  },
  semis: async () => {
    const { data, error } = await sb.from('copa_tabla').select('*');
    if (error) return aviso(traducirError(error), true);
    const gs = agruparTabla(data);
    if (gs.length < 2 || gs[0].filas.length < 2 || gs[1].filas.length < 2) return aviso('Se necesitan 2 grupos con al menos 2 equipos', true);
    const pend = A.partidos.filter((p) => p.fase === 'grupos' && p.estado !== 'finalizado' && [gs[0].grupo, gs[1].grupo].includes(p.grupo)).length;
    if (pend && !confirm(`Faltan ${pend} partidos de grupos por terminar. ¿Armar las semifinales con la tabla actual?`)) return;
    const [A1, A2] = gs[0].filas, [B1, B2] = gs[1].filas;
    const cruces = [
      { etiqueta: 'Semi 1', local_id: A1.equipo_id, visita_id: B2.equipo_id, local_desc: `1º Grupo ${gs[0].grupo}`, visita_desc: `2º Grupo ${gs[1].grupo}` },
      { etiqueta: 'Semi 2', local_id: B1.equipo_id, visita_id: A2.equipo_id, local_desc: `1º Grupo ${gs[1].grupo}`, visita_desc: `2º Grupo ${gs[0].grupo}` }
    ];
    const existentes = A.partidos.filter((p) => p.fase === 'semifinal').sort((a, b) => (a.etiqueta || '').localeCompare(b.etiqueta || '') || a.id - b.id);
    for (let i = 0; i < 2; i++) {
      if (existentes[i]) await q(sb.from('copa_partidos').update(cruces[i]).eq('id', existentes[i].id));
      else await q(sb.from('copa_partidos').insert({ fase: 'semifinal', ...cruces[i] }));
    }
    aviso('Semifinales armadas');
    refrescar();
  },
  finales: async () => {
    const semis = A.partidos.filter((p) => p.fase === 'semifinal').sort((a, b) => (a.etiqueta || '').localeCompare(b.etiqueta || '') || a.id - b.id);
    if (semis.length < 2) return aviso('Primero arma las dos semifinales', true);
    const g = semis.map(ganador), l = semis.map(perdedor);
    if (g.some((x) => !x)) return aviso('Las dos semifinales deben estar finalizadas con un ganador (si empatan, carga los penales)', true);
    const set = async (fase, etiqueta, datos) => {
      const ex = A.partidos.find((p) => p.fase === fase);
      return ex ? q(sb.from('copa_partidos').update(datos).eq('id', ex.id)) : q(sb.from('copa_partidos').insert({ fase, etiqueta, ...datos }));
    };
    await set('final', 'Gran final', { local_id: g[0], visita_id: g[1] });
    await set('tercer_puesto', 'Tercer puesto', { local_id: l[0], visita_id: l[1] });
    aviso('Final y tercer puesto listos');
    refrescar();
  },

  // Permisos
  agregarAdmin: async () => {
    const email = val('adEmail').toLowerCase(), nombre = val('adNombre');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !nombre) return aviso('Escribe un correo válido y el nombre', true);
    const datos = { email, nombre, rol: 'admin' };
    PERMISOS.forEach(([k], i) => { datos[k] = document.getElementById('adP' + i).checked; });
    if (await q(sb.from('copa_admins').insert(datos), 'Administrador agregado')) refrescar();
  },
  quitarAdmin: async (b) => {
    if (!confirm(`¿Quitar a ${b.dataset.email}? Ya no podrá entrar al panel.`)) return;
    if (await q(sb.from('copa_admins').delete().eq('email', b.dataset.email), 'Administrador quitado')) refrescar();
  }
};

const CAMBIOS = {
  partido: async (el) => { A.pl.partidoId = Number(el.value) || null; A.pl.sel = null; A.pl.lado = 'local'; await cargarEventos(); pintar(); },
  penales: async (el) => {
    const v = el.value === '' ? null : Number(el.value);
    if (await q(sb.from('copa_partidos').update({ [el.dataset.campo]: v }).eq('id', A.pl.partidoId))) refrescar();
  },
  jug: async (el) => {
    const c = el.dataset.campo;
    const v = c === 'suplente' ? el.checked : c === 'dorsal' ? (el.value === '' ? null : Number(el.value)) : el.value.trim();
    if (c === 'nombre' && !v) return aviso('El nombre no puede quedar vacío', true);
    const ok = await q(sb.from('copa_jugadores').update({ [c]: v }).eq('id', Number(el.dataset.id)), 'Guardado');
    if (ok) { const j = A.jugadores.find((x) => x.id === Number(el.dataset.id)); if (j) j[c] = v; }
  },
  partidoCampo: async (el) => {
    const c = el.dataset.campo;
    const v = c === 'fecha_hora' ? desdeLocal(el.value) : (Number(el.value) || null);
    if (await q(sb.from('copa_partidos').update({ [c]: v }).eq('id', Number(el.dataset.id)), 'Partido actualizado')) refrescar();
  },
  perm: async (el) => {
    if (!(await q(sb.from('copa_admins').update({ [el.dataset.campo]: el.checked }).eq('email', el.dataset.email), 'Permiso actualizado'))) el.checked = !el.checked;
  }
};

document.addEventListener('submit', async (ev) => {
  if (ev.target.id === 'formLogin') {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: val('lgEmail').toLowerCase(), password: document.getElementById('lgClave').value });
    if (error) { aviso(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos' : error.message, true); btn.disabled = false; btn.textContent = 'Entrar'; }
  }
  if (ev.target.id === 'formClave') {
    ev.preventDefault();
    const c1 = document.getElementById('nvClave').value, c2 = document.getElementById('nvClave2').value;
    if (c1.length < 8) return aviso('Mínimo 8 caracteres', true);
    if (c1 !== c2) return aviso('Las contraseñas no coinciden', true);
    if (await q(sb.auth.updateUser({ password: c1 }), 'Contraseña cambiada')) ev.target.reset();
  }
});

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-accion]');
  if (!b || b.disabled) return;
  const fn = ACCIONES[b.dataset.accion];
  if (fn) { ev.preventDefault(); fn(b); }
});
document.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-cambio]');
  if (el && CAMBIOS[el.dataset.cambio]) CAMBIOS[el.dataset.cambio](el);
});
document.addEventListener('toggle', (ev) => {
  const d = ev.target;
  if (d.matches?.('details[data-eq]')) { const id = Number(d.dataset.eq); d.open ? A.abiertos.add(id) : A.abiertos.delete(id); }
}, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && A.yo) { sincronizarHora(); if (A.tab === 'planillero') refrescar(); } });

iniciar();
