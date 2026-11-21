-- =====================================================================
--  COPA DECEMBRINA DE HINCHAS · TESALIA
--  Esquema para Supabase · proyecto PROPIO de la Copa (separado de vóley)
--  Todas las tablas llevan el prefijo copa_.
--  Ejecutar completo UNA vez en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- 1. TABLAS ----------------------------------------------------

create table if not exists public.copa_config (
  id int primary key default 1 check (id = 1),
  nombre text not null default 'Copa Decembrina de Hinchas 2026',
  sede text not null default 'Cancha Olímpica de Fútbol 11 · Tesalia, Huila',
  clasifican_por_grupo int not null default 2
);
insert into public.copa_config (id) values (1) on conflict do nothing;

-- Dueño y administradores, con permisos por persona
create table if not exists public.copa_admins (
  email text primary key check (email = lower(email)),
  nombre text not null,
  rol text not null default 'admin' check (rol in ('dueno', 'admin')),
  puede_planillar boolean not null default true,          -- cargar goles, tarjetas, reloj
  puede_editar_equipos boolean not null default true,     -- equipos y jugadores
  puede_gestionar_partidos boolean not null default false,-- crear/borrar partidos, fixture, llaves
  puede_corregir_cerrados boolean not null default false, -- tocar partidos ya finalizados
  creado_en timestamptz not null default now()
);

-- Dueño del sistema
insert into public.copa_admins (email, nombre, rol, puede_planillar, puede_editar_equipos, puede_gestionar_partidos, puede_corregir_cerrados)
values ('projectspia1@gmail.com', 'Pedro Cabrera', 'dueno', true, true, true, true)
on conflict (email) do update set rol = 'dueno';

create table if not exists public.copa_equipos (
  id bigint generated always as identity primary key,
  nombre text not null,
  corto text not null,
  grupo text,
  creado_en timestamptz not null default now()
);

create table if not exists public.copa_jugadores (
  id bigint generated always as identity primary key,
  equipo_id bigint not null references public.copa_equipos(id) on delete cascade,
  dorsal int,
  nombre text not null,
  suplente boolean not null default false,
  activo boolean not null default true
);
create index if not exists copa_jugadores_equipo on public.copa_jugadores(equipo_id);

create table if not exists public.copa_partidos (
  id bigint generated always as identity primary key,
  fase text not null default 'grupos' check (fase in ('grupos', 'semifinal', 'tercer_puesto', 'final')),
  grupo text,
  etiqueta text,                      -- "Fecha 1", "Semi 1", etc.
  fecha_hora timestamptz,
  local_id bigint references public.copa_equipos(id) on delete set null,
  visita_id bigint references public.copa_equipos(id) on delete set null,
  local_desc text,                    -- "1º Grupo A" mientras no se sabe el equipo
  visita_desc text,
  estado text not null default 'programado' check (estado in ('programado', 'en_juego', 'finalizado')),
  periodo text not null default '1T' check (periodo in ('1T', 'Descanso', '2T', 'Penales', 'Final')),
  reloj_base int not null default 0,  -- segundos acumulados
  reloj_desde timestamptz,            -- si no es null, el reloj está corriendo desde esta hora (del servidor)
  goles_local int not null default 0, -- lo calcula el trigger, no se edita a mano
  goles_visita int not null default 0,
  penales_local int,
  penales_visita int,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.copa_eventos (
  id bigint generated always as identity primary key,
  partido_id bigint not null references public.copa_partidos(id) on delete cascade,
  jugador_id bigint references public.copa_jugadores(id) on delete set null,
  equipo_id bigint not null references public.copa_equipos(id) on delete cascade, -- equipo del jugador
  tipo text not null check (tipo in ('gol', 'autogol', 'amarilla', 'roja')),
  minuto int not null,
  automatica boolean not null default false,  -- roja puesta sola por doble amarilla
  origen_id bigint references public.copa_eventos(id) on delete cascade,
  creado_por text default lower(coalesce(auth.jwt() ->> 'email', '')),
  creado_en timestamptz not null default now()
);
create index if not exists copa_eventos_partido on public.copa_eventos(partido_id);

-- ---------- 2. FUNCIONES DE PERMISOS -----------------------------------

create or replace function public.copa_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.copa_puede(permiso text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.copa_admins a
    where a.email = public.copa_email()
      and (a.rol = 'dueno' or case permiso
            when 'admin' then true
            when 'planillar' then a.puede_planillar
            when 'editar_equipos' then a.puede_editar_equipos
            when 'gestionar_partidos' then a.puede_gestionar_partidos
            when 'corregir_cerrados' then a.puede_corregir_cerrados
            else false end)
  )
$$;

create or replace function public.copa_es_dueno() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.copa_admins a where a.email = public.copa_email() and a.rol = 'dueno')
$$;

-- Hora del servidor (para que todos los celulares vean el mismo minuto)
create or replace function public.copa_ahora() returns timestamptz
language sql stable as $$ select now() $$;

-- ---------- 3. TRIGGERS --------------------------------------------------

-- Recalcula el marcador cada vez que se agrega, cambia o borra una jugada
create or replace function public.copa_recalcular_goles() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid bigint;
begin
  if tg_op = 'DELETE' then pid := old.partido_id; else pid := new.partido_id; end if;
  update public.copa_partidos p set
    goles_local = (select count(*) from public.copa_eventos e where e.partido_id = p.id
                   and ((e.tipo = 'gol' and e.equipo_id = p.local_id) or (e.tipo = 'autogol' and e.equipo_id = p.visita_id))),
    goles_visita = (select count(*) from public.copa_eventos e where e.partido_id = p.id
                   and ((e.tipo = 'gol' and e.equipo_id = p.visita_id) or (e.tipo = 'autogol' and e.equipo_id = p.local_id))),
    actualizado_en = now()
  where p.id = pid;
  return null;
end $$;

drop trigger if exists copa_eventos_goles on public.copa_eventos;
create trigger copa_eventos_goles after insert or update or delete on public.copa_eventos
for each row execute function public.copa_recalcular_goles();

-- Segunda amarilla = roja automática (si se borra la amarilla, se borra la roja)
create or replace function public.copa_doble_amarilla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'amarilla' and new.jugador_id is not null
     and (select count(*) from public.copa_eventos where partido_id = new.partido_id and jugador_id = new.jugador_id and tipo = 'amarilla') >= 2
     and not exists (select 1 from public.copa_eventos where partido_id = new.partido_id and jugador_id = new.jugador_id and tipo = 'roja') then
    insert into public.copa_eventos (partido_id, jugador_id, equipo_id, tipo, minuto, automatica, origen_id, creado_por)
    values (new.partido_id, new.jugador_id, new.equipo_id, 'roja', new.minuto, true, new.id, new.creado_por);
  end if;
  return null;
end $$;

drop trigger if exists copa_eventos_doble_amarilla on public.copa_eventos;
create trigger copa_eventos_doble_amarilla after insert on public.copa_eventos
for each row execute function public.copa_doble_amarilla();

-- Si se borra una amarilla y el jugador queda con menos de 2, se quita la roja automática
create or replace function public.copa_quitar_roja_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tipo = 'amarilla' and old.jugador_id is not null
     and (select count(*) from public.copa_eventos where partido_id = old.partido_id and jugador_id = old.jugador_id and tipo = 'amarilla') < 2 then
    delete from public.copa_eventos
     where partido_id = old.partido_id and jugador_id = old.jugador_id and tipo = 'roja' and automatica;
  end if;
  return null;
end $$;

drop trigger if exists copa_eventos_quitar_roja on public.copa_eventos;
create trigger copa_eventos_quitar_roja after delete on public.copa_eventos
for each row execute function public.copa_quitar_roja_auto();

create or replace function public.copa_tocar_partido() returns trigger
language plpgsql as $$ begin new.actualizado_en := now(); return new; end $$;
drop trigger if exists copa_partidos_tocar on public.copa_partidos;
create trigger copa_partidos_tocar before update on public.copa_partidos
for each row execute function public.copa_tocar_partido();

-- ---------- 4. RELOJ DEL PARTIDO (se maneja con la hora del servidor) ----

create or replace function public.copa_reloj(p_partido bigint, p_accion text, p_segundos int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare est text;
begin
  select estado into est from public.copa_partidos where id = p_partido;
  if not (public.copa_puede('corregir_cerrados') or (public.copa_puede('planillar') and est <> 'finalizado')) then
    raise exception 'No tienes permiso para manejar el reloj de este partido';
  end if;
  if p_accion = 'iniciar' then
    update public.copa_partidos
       set reloj_desde = now(), estado = case when estado = 'programado' then 'en_juego' else estado end
     where id = p_partido and reloj_desde is null;
  elsif p_accion = 'pausar' then
    update public.copa_partidos
       set reloj_base = reloj_base + floor(extract(epoch from now() - reloj_desde))::int, reloj_desde = null
     where id = p_partido and reloj_desde is not null;
  elsif p_accion = 'fijar' then
    update public.copa_partidos
       set reloj_base = greatest(p_segundos, 0), reloj_desde = case when reloj_desde is null then null else now() end
     where id = p_partido;
  else
    raise exception 'Acción de reloj no válida';
  end if;
end $$;

-- ---------- 5. VISTAS PÚBLICAS -----------------------------------------

create or replace view public.copa_tabla with (security_invoker = true) as
with r as (
  select p.local_id as eq, p.goles_local as gf, p.goles_visita as gc
    from public.copa_partidos p where p.fase = 'grupos' and p.estado = 'finalizado' and p.local_id is not null
  union all
  select p.visita_id, p.goles_visita, p.goles_local
    from public.copa_partidos p where p.fase = 'grupos' and p.estado = 'finalizado' and p.visita_id is not null
)
select q.id as equipo_id, q.nombre, q.corto, q.grupo,
       count(r.eq)::int as pj,
       (count(*) filter (where r.gf > r.gc))::int as g,
       (count(*) filter (where r.gf = r.gc))::int as e,
       (count(*) filter (where r.gf < r.gc))::int as p,
       coalesce(sum(r.gf), 0)::int as gf,
       coalesce(sum(r.gc), 0)::int as gc,
       (coalesce(sum(r.gf), 0) - coalesce(sum(r.gc), 0))::int as dg,
       (3 * count(*) filter (where r.gf > r.gc) + count(*) filter (where r.gf = r.gc))::int as pts
from public.copa_equipos q
left join r on r.eq = q.id
group by q.id;

create or replace view public.copa_goleadores with (security_invoker = true) as
select j.id as jugador_id, j.nombre, j.dorsal, q.id as equipo_id, q.nombre as equipo, count(*)::int as goles
from public.copa_eventos ev
join public.copa_jugadores j on j.id = ev.jugador_id
join public.copa_equipos q on q.id = j.equipo_id
where ev.tipo = 'gol'
group by j.id, q.id;

-- ---------- 6. SEGURIDAD (RLS) -------------------------------------------
-- El público solo LEE. Escribir depende de los permisos de cada admin.

alter table public.copa_config    enable row level security;
alter table public.copa_admins    enable row level security;
alter table public.copa_equipos   enable row level security;
alter table public.copa_jugadores enable row level security;
alter table public.copa_partidos  enable row level security;
alter table public.copa_eventos   enable row level security;

drop policy if exists copa_config_leer on public.copa_config;
create policy copa_config_leer on public.copa_config for select using (true);
drop policy if exists copa_config_editar on public.copa_config;
create policy copa_config_editar on public.copa_config for update
  using (public.copa_puede('gestionar_partidos')) with check (public.copa_puede('gestionar_partidos'));

-- Admins: los ven los admins; solo el dueño agrega, cambia permisos o quita
drop policy if exists copa_admins_leer on public.copa_admins;
create policy copa_admins_leer on public.copa_admins for select using (public.copa_puede('admin'));
drop policy if exists copa_admins_agregar on public.copa_admins;
create policy copa_admins_agregar on public.copa_admins for insert
  with check (public.copa_es_dueno() and rol = 'admin');
drop policy if exists copa_admins_cambiar on public.copa_admins;
create policy copa_admins_cambiar on public.copa_admins for update
  using (public.copa_es_dueno()) with check (public.copa_es_dueno() and (rol = 'admin' or email = public.copa_email()));
drop policy if exists copa_admins_quitar on public.copa_admins;
create policy copa_admins_quitar on public.copa_admins for delete
  using (public.copa_es_dueno() and rol = 'admin');

-- Equipos y jugadores
drop policy if exists copa_equipos_leer on public.copa_equipos;
create policy copa_equipos_leer on public.copa_equipos for select using (true);
drop policy if exists copa_equipos_escribir on public.copa_equipos;
create policy copa_equipos_escribir on public.copa_equipos for all
  using (public.copa_puede('editar_equipos')) with check (public.copa_puede('editar_equipos'));

drop policy if exists copa_jugadores_leer on public.copa_jugadores;
create policy copa_jugadores_leer on public.copa_jugadores for select using (true);
drop policy if exists copa_jugadores_escribir on public.copa_jugadores;
create policy copa_jugadores_escribir on public.copa_jugadores for all
  using (public.copa_puede('editar_equipos')) with check (public.copa_puede('editar_equipos'));

-- Partidos
drop policy if exists copa_partidos_leer on public.copa_partidos;
create policy copa_partidos_leer on public.copa_partidos for select using (true);
drop policy if exists copa_partidos_crear on public.copa_partidos;
create policy copa_partidos_crear on public.copa_partidos for insert
  with check (public.copa_puede('gestionar_partidos'));
drop policy if exists copa_partidos_borrar on public.copa_partidos;
create policy copa_partidos_borrar on public.copa_partidos for delete
  using (public.copa_puede('gestionar_partidos'));
drop policy if exists copa_partidos_cambiar on public.copa_partidos;
create policy copa_partidos_cambiar on public.copa_partidos for update
  using (public.copa_puede('gestionar_partidos') or public.copa_puede('corregir_cerrados')
         or (public.copa_puede('planillar') and estado <> 'finalizado'))
  with check (public.copa_puede('admin'));

-- Jugadas (goles y tarjetas)
drop policy if exists copa_eventos_leer on public.copa_eventos;
create policy copa_eventos_leer on public.copa_eventos for select using (true);
drop policy if exists copa_eventos_crear on public.copa_eventos;
create policy copa_eventos_crear on public.copa_eventos for insert
  with check (public.copa_puede('corregir_cerrados') or (public.copa_puede('planillar')
    and exists (select 1 from public.copa_partidos p where p.id = partido_id and p.estado <> 'finalizado')));
drop policy if exists copa_eventos_borrar on public.copa_eventos;
create policy copa_eventos_borrar on public.copa_eventos for delete
  using (public.copa_puede('corregir_cerrados') or (public.copa_puede('planillar')
    and exists (select 1 from public.copa_partidos p where p.id = partido_id and p.estado <> 'finalizado')));

grant select on public.copa_tabla, public.copa_goleadores to anon, authenticated;
grant execute on function public.copa_ahora() to anon, authenticated;
grant execute on function public.copa_reloj(bigint, text, int) to authenticated;
grant execute on function public.copa_puede(text) to anon, authenticated;
grant execute on function public.copa_es_dueno() to anon, authenticated;

-- ---------- 7. TIEMPO REAL ------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['copa_partidos', 'copa_eventos', 'copa_equipos', 'copa_jugadores', 'copa_config'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Listo. Siguiente (opcional): 02_datos_ejemplo.sql para probar con equipos de mentira.
