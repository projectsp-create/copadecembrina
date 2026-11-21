# Copa Decembrina de Hinchas · Tesalia · versión 1.3

Web en vivo de la Copa (marcador con minuto, goles con autor, tarjetas, tabla, goleadores y llaves) y panel de administración para el planillero.

- **Página pública:** `index.html`. No pide iniciar sesión y es la que se comparte por enlace o QR.
- **Panel de administración:** `admin.html`. Se entra con correo y contraseña y solo deja pasar a los correos autorizados.
- **Base de datos:** un proyecto de Supabase **propio de la Copa**, totalmente separado del de vóley playa.
- **Dirección web propia:** por ejemplo `https://copadecembrina.github.io/`, distinta a la de vóley.
- **Dueño:** projectspia1@gmail.com, que tiene todos los permisos y es el único que agrega, quita o cambia los permisos de los admins.

En esta guía, cambia `copadecembrina` por el nombre que elijas en el paso 1 y `TU-PROYECTO` por el código que te dé Supabase en el paso 2.

---

## Paso 1 · Crear la dirección web propia en GitHub (5 min)

Para que la Copa tenga una URL **distinta** a la de vóley, se crea una "organización" gratis de GitHub con tu misma cuenta:

1. Entra a <https://github.com> con tu cuenta y dale clic a tu foto (arriba a la derecha). Luego ve a **Your organizations → New organization → Free**.
2. Nombre de la organización: por ejemplo `copadecembrina`. Si está ocupado, prueba `copahinchastesalia` o algo parecido. Ese nombre será tu dirección.
3. Correo de contacto: projectspia1@gmail.com. Elige *My personal account* y termina el registro (puedes saltarte invitar miembros).
4. Dentro de la organización dale **New repository**:
   - Nombre **exacto**: `copadecembrina.github.io` (el nombre de la organización + `.github.io`).
   - Márcalo como **Public**.
   - Dale **Create repository**.
5. Haz clic en **uploading an existing file** y arrastra **todo el contenido** de esta carpeta: `index.html`, `admin.html` y las carpetas `css`, `js` y `supabase`. Deben quedar en la raíz. Abajo dale **Commit changes**.
   - Todavía falta poner los datos de Supabase en `js/config.js`. Eso se hace en el paso 2 y se edita directo en GitHub.
6. Ve a **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**. En 1 o 2 minutos quedan listas:
   - Pública: `https://copadecembrina.github.io/`
   - Admin: `https://copadecembrina.github.io/admin.html`

## Paso 2 · Crear el proyecto nuevo en Supabase (5 min)

1. Entra a <https://supabase.com/dashboard> con projectspia1@gmail.com y dale **New project**.
   - Nombre: `copa-decembrina`
   - Contraseña de la base: genera una y **guárdala**.
   - Región: la más cercana, por ejemplo *East US* o *São Paulo*.
   - Plan **Free**.
   - El plan gratis permite pocos proyectos activos a la vez (tradicionalmente 2). Con vóley y la Copa estarías justo en el límite. Si ya tuvieras otro proyecto, Supabase te avisa.
2. Cuando termine de crearse, ve a **SQL Editor → New query**, pega todo `supabase/01_esquema.sql` y dale **Run**.
   - Debe salir *Success*. Si aparecen avisos "does not exist, skipping", es normal.
3. (Opcional, para probar) Haz otra consulta con `supabase/02_datos_ejemplo.sql` y dale **Run**.
4. Ve a **Project Settings → API** (puede aparecer como *Data API* o *API Keys*) y copia la **Project URL** (`https://TU-PROYECTO.supabase.co`) y la **anon public key** (o *publishable key*).
5. En GitHub abre `js/config.js`, toca el lápiz ✏️, pega los dos datos y dale **Commit changes**.
   - ⚠️ Nunca pegues la **service_role / secret key**. La anon key sí puede ser pública porque la seguridad la ponen las reglas RLS.

## Paso 3 · Acceso de admins con correo y contraseña (3 min)

No usa Google: cada admin entra con un correo y una contraseña que tú le creas.

1. En Supabase ve a **Authentication → Sign In / Providers**:
   - **Email** debe estar activado (viene así).
   - Desactiva **Allow new users to sign up**, para que nadie se pueda registrar solo.
   - Desactiva **Confirm email**, si aparece.
   - Dale **Save**.
2. Ve a **Authentication → Users → Add user → Create new user**:
   - **Email:** projectspia1@gmail.com
   - **Password:** la que quieras (mínimo 8 caracteres).
   - Marca **Auto Confirm User** y dale **Create user**.
3. Por cada admin repite el punto 2 con su correo y una contraseña. Después, en el panel, pestaña **Permisos**, lo agregas con **el mismo correo** y le marcas qué puede hacer.
4. Cada quien puede cambiar su contraseña en el panel: **Cambiar mi contraseña**, arriba.
5. Si alguien la olvida: ve a **Authentication → Users**, en su fila toca **⋯** y cámbiala desde ahí, o bórralo y créalo de nuevo.
6. **Authentication → URL Configuration → Site URL:** pon tu dirección de GitHub (por ejemplo `https://copadecembrina.github.io`).

## Paso 4 · Probar (10 min)

1. Abre la página de **admin** y entra con projectspia1@gmail.com y la contraseña que creaste.
2. Revisa estas pestañas:
   - **Permisos:** agrega a tus admins con el mismo correo de su usuario y marca qué puede hacer cada uno.
   - **Equipos:** crea las barras con sigla y grupo, y carga a los jugadores. Puedes pegar la lista completa, una línea por jugador con `dorsal nombre`, y poner `*` al final si es suplente.
   - **Partidos:** usa **Generar fixture de grupos** y luego ponle fecha y hora a cada partido.
   - **Planillero:** elige el partido y dale *Iniciar partido*. Para registrar una jugada tocas el **jugador** y luego **Gol / Autogol / Amarilla / Roja**.
3. Abre la página pública en otro celular y mira cómo se actualiza sola.
4. Cuando termines de probar, ejecuta `supabase/03_limpiar_torneo.sql` en el SQL Editor. Borra equipos, partidos y jugadas, pero no toca los admins ni sus permisos.

## Qué puede hacer cada uno

| Permiso | Dueño | Admin (según lo que marques) |
|---|---|---|
| Planillar (reloj, goles, tarjetas, finalizar) | ✅ | ☑️ |
| Editar equipos y jugadores | ✅ | ☑️ |
| Crear partidos, fixture y llaves | ✅ | ☑️ |
| Corregir partidos ya cerrados | ✅ | ☑️ |
| Agregar/quitar admins y cambiar permisos | ✅ | ❌ nunca |

Estas reglas las aplica la base de datos (RLS). Aunque alguien modifique la página, no puede saltárselas.

## Cómo funciona por dentro

- **Marcador:** se calcula solo a partir de las jugadas. Si se borra un gol, el marcador baja.
- **Segunda amarilla:** pone la roja automática. Si se borra una de las amarillas, la roja se quita sola.
- **Minuto:** el reloj usa la hora del servidor, así que todos los celulares ven el mismo minuto.
  - Al pasar a *2T*, el reloj salta a 45:00 si iba por debajo.
  - En *Descanso* y *Penales* el reloj se pausa.
- **Tabla:** solo cuenta los partidos **finalizados** de la fase de grupos. El orden es por puntos, luego diferencia de gol, goles a favor y nombre.
- **Llaves:**
  - *Armar semifinales* cruza 1A–2B y 1B–2A.
  - *Pasar ganadores* llena la final y el tercer puesto. Si una semifinal termina empatada, primero carga los penales en el planillero.
- **Tiempo real:** la página pública se actualiza sola con cada cambio y además recarga cada 30 s por si el celular pierde la conexión.

## Archivos

```
index.html              Página pública
admin.html              Panel de administración
css/estilos.css         Colores y estilos (azul noche + cian)
js/config.js            ← Aquí van la URL y la anon key de Supabase
js/comun.js             Conexión y utilidades
js/publico.js           Lógica de la página pública
js/admin.js             Lógica del panel
supabase/01_esquema.sql      Tablas, permisos, reglas y tiempo real (correr 1 vez)
supabase/02_datos_ejemplo.sql Datos de prueba (opcional)
supabase/03_limpiar_torneo.sql Borra datos del torneo (no toca admins)
```

## Bueno saber

- En el plan gratis, Supabase pausa los proyectos que pasan varios días sin uso. Como este proyecto es solo para la Copa, entra al panel de Supabase unos días antes del torneo y, si está pausado, dale *Restore*. Durante el torneo, con el uso diario, se mantiene activo.
- Vóley y Copa no comparten nada: son proyectos, bases, admins y direcciones distintas.
