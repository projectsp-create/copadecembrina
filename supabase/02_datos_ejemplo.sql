-- =====================================================================
--  DATOS DE EJEMPLO (opcional) para probar la web antes del torneo.
--  8 barras en 2 grupos, 14 jugadores cada una, fixture de grupos y llaves.
--  Para borrarlos después: 03_limpiar_torneo.sql
-- =====================================================================

with eq as (
  insert into public.copa_equipos (nombre, corto, grupo) values
    ('Hinchas Atlético Huila', 'HUI', 'A'),
    ('Hinchas Millonarios', 'MIL', 'A'),
    ('Hinchas Nacional', 'NAC', 'A'),
    ('Hinchas Junior', 'JUN', 'A'),
    ('Hinchas América', 'AME', 'B'),
    ('Hinchas Santa Fe', 'SFE', 'B'),
    ('Hinchas Deportivo Cali', 'CAL', 'B'),
    ('Hinchas Once Caldas', 'ONC', 'B')
  returning id, corto
)
insert into public.copa_jugadores (equipo_id, dorsal, nombre, suplente)
select eq.id, n, 'Jugador ' || n || ' ' || eq.corto, n > 11
from eq cross join generate_series(1, 14) n;

-- Fixture todos contra todos por grupo (3 fechas), sin hora definida
with g as (
  select id, grupo, row_number() over (partition by grupo order by id) as k from public.copa_equipos
),
cruces(fecha, a, b) as (values (1,1,2),(1,3,4),(2,1,3),(2,2,4),(3,1,4),(3,2,3))
insert into public.copa_partidos (fase, grupo, etiqueta, local_id, visita_id)
select 'grupos', l.grupo, 'Fecha ' || c.fecha, l.id, v.id
from cruces c
join g l on l.k = c.a
join g v on v.k = c.b and v.grupo = l.grupo
order by c.fecha, l.grupo;

insert into public.copa_partidos (fase, etiqueta, local_desc, visita_desc) values
  ('semifinal', 'Semi 1', '1º Grupo A', '2º Grupo B'),
  ('semifinal', 'Semi 2', '1º Grupo B', '2º Grupo A'),
  ('tercer_puesto', 'Tercer puesto', 'Perdedor Semi 1', 'Perdedor Semi 2'),
  ('final', 'Gran final', 'Ganador Semi 1', 'Ganador Semi 2');
