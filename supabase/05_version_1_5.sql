-- =====================================================================
--  ACTUALIZACIÓN A VERSIÓN 1.5 · Copa Decembrina de Hinchas
--  Ejecutar UNA vez en SQL Editor > New query > Run (si sale el aviso
--  de RLS, dale "Run and enable RLS"). No borra ningún dato.
--  Agrega: reglas de sanción y desempate, color de cada barra, documento
--  y arquero de cada jugador, cambios (sustituciones) y patrocinadores.
-- =====================================================================

-- Reglas del torneo
alter table public.copa_config add column if not exists amarillas_suspension int not null default 3; -- cada N amarillas = 1 fecha
alter table public.copa_config add column if not exists roja_fechas int not null default 1;          -- fechas de suspensión por roja
alter table public.copa_config add column if not exists desempate text not null default 'pts,dg,gf,directo';

-- Color de cada barra
alter table public.copa_equipos add column if not exists color text not null default '#0A78C2';

-- Inscripción: documento (privado) y arquero
alter table public.copa_jugadores add column if not exists documento text;
alter table public.copa_jugadores add column if not exists es_arquero boolean not null default false;
-- Un mismo documento no puede estar inscrito en dos barras
create unique index if not exists copa_jugadores_documento_unico
  on public.copa_jugadores (documento) where documento is not null and documento <> '';

-- Cambios (sustituciones): jugador_id = sale, jugador_entra_id = entra
alter table public.copa_eventos add column if not exists jugador_entra_id bigint references public.copa_jugadores(id) on delete set null;
alter table public.copa_eventos drop constraint if exists copa_eventos_tipo_check;
alter table public.copa_eventos add constraint copa_eventos_tipo_check
  check (tipo in ('gol', 'autogol', 'amarilla', 'roja', 'cambio'));

-- Patrocinadores
create table if not exists public.copa_patrocinadores (
  id bigint generated always as identity primary key,
  nombre text not null,
  logo_url text,
  enlace text,
  orden int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.copa_patrocinadores enable row level security;
drop policy if exists copa_patro_leer on public.copa_patrocinadores;
create policy copa_patro_leer on public.copa_patrocinadores for select using (true);
drop policy if exists copa_patro_escribir on public.copa_patrocinadores;
create policy copa_patro_escribir on public.copa_patrocinadores for all
  using (public.copa_puede('gestionar_partidos')) with check (public.copa_puede('gestionar_partidos'));

-- Acceso de la API
grant select on public.copa_patrocinadores to anon, authenticated;
grant select, insert, update, delete on public.copa_patrocinadores to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Privacidad: el público NO puede ver el documento de los jugadores
revoke select on public.copa_jugadores from anon;
grant select (id, equipo_id, dorsal, nombre, suplente, activo, es_arquero) on public.copa_jugadores to anon;

-- Tiempo real para patrocinadores
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'copa_patrocinadores') then
    execute 'alter publication supabase_realtime add table public.copa_patrocinadores';
  end if;
end $$;

-- Carpeta pública "copa" para subir logos de patrocinadores (Supabase Storage)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    begin
      insert into storage.buckets (id, name, public) values ('copa', 'copa', true)
      on conflict (id) do update set public = true;
      execute 'drop policy if exists copa_logos_subir on storage.objects';
      execute 'create policy copa_logos_subir on storage.objects for insert to authenticated with check (bucket_id = ''copa'' and public.copa_puede(''gestionar_partidos''))';
      execute 'drop policy if exists copa_logos_borrar on storage.objects';
      execute 'create policy copa_logos_borrar on storage.objects for delete to authenticated using (bucket_id = ''copa'' and public.copa_puede(''gestionar_partidos''))';
      execute 'drop policy if exists copa_logos_ver on storage.objects';
      execute 'create policy copa_logos_ver on storage.objects for select using (bucket_id = ''copa'')';
    exception when others then
      raise notice 'No se pudo configurar la carpeta de logos (%). Los logos se pueden poner con un link.', sqlerrm;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
