-- =====================================================================
--  ARREGLO: "permission denied for table copa_..."
--  Los proyectos nuevos de Supabase no dan acceso automático a las tablas
--  creadas por SQL. Esto da el acceso básico; la seguridad real la siguen
--  poniendo las reglas RLS (el público solo lee, los admins según permisos).
--  Ejecutar UNA vez en SQL Editor > New query > Run.
-- =====================================================================
grant usage on schema public to anon, authenticated;

grant select on public.copa_config, public.copa_equipos, public.copa_jugadores,
               public.copa_partidos, public.copa_eventos,
               public.copa_tabla, public.copa_goleadores to anon, authenticated;

grant select, insert, update, delete on public.copa_config, public.copa_admins, public.copa_equipos,
               public.copa_jugadores, public.copa_partidos, public.copa_eventos to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.copa_ahora() to anon, authenticated;
grant execute on function public.copa_puede(text) to anon, authenticated;
grant execute on function public.copa_es_dueno() to anon, authenticated;
grant execute on function public.copa_email() to anon, authenticated;
grant execute on function public.copa_reloj(bigint, text, int) to authenticated;

-- Que la API vea los cambios de inmediato
notify pgrst, 'reload schema';
