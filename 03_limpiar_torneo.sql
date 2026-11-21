-- =====================================================================
--  BORRA equipos, jugadores, partidos y jugadas de la Copa
--  (NO toca la lista de admins ni los permisos).
--  Úsalo para quitar los datos de ejemplo antes del torneo real.
-- =====================================================================
truncate public.copa_eventos, public.copa_partidos, public.copa_jugadores, public.copa_equipos restart identity cascade;
