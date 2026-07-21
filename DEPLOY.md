# Cómo publicar el sistema en la nube (gratis)

> **¿Por qué no Netlify?** Netlify sirve páginas estáticas y funciones serverless; esta app
> necesita un **servidor Node corriendo** y una **base de datos persistente**. La combinación
> gratuita equivalente es **Render** (corre el servidor) + **Turso** (base de datos SQLite en
> la nube). Ambos tienen plan gratuito sin tarjeta de crédito.

## Resumen

| Pieza | Servicio | Plan |
|---|---|---|
| Servidor Node (API + web) | [Render](https://render.com) | Free (se "duerme" tras 15 min sin uso; tarda ~30-60 s en despertar) |
| Base de datos | [Turso](https://turso.tech) | Free (persistente, sobra para esta app) |

Localmente no hace falta nada de esto: `npm install` + `node server.js` usa un archivo
`turnera.db` en la carpeta del proyecto.

## Paso 1 — Subir el código a GitHub

1. Creá un repositorio en [github.com](https://github.com) (ej. `turnera-san-fernando`).
2. Desde esta carpeta:
   ```
   git init
   git add .
   git commit -m "Turnera Aeroplanta San Fernando"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/turnera-san-fernando.git
   git push -u origin main
   ```
   (El `.gitignore` ya excluye `node_modules` y la base local.)

## Paso 2 — Crear la base de datos en Turso

1. Creá una cuenta gratis en [turso.tech](https://turso.tech) (podés entrar con GitHub).
2. Creá una base de datos (ej. `turnera-sf`). Región: `gru` (San Pablo) es la más cercana.
3. Copiá dos datos:
   - **Database URL** → algo como `libsql://turnera-sf-tuusuario.turso.io`
   - **Auth token** → botón "Create token" / "Generate token"

Las tablas y los datos iniciales se crean solos la primera vez que el servidor arranca.

## Paso 3 — Crear el servicio en Render

1. Creá una cuenta gratis en [render.com](https://render.com) (podés entrar con GitHub).
2. **New → Web Service** → conectá tu repositorio de GitHub.
3. Render detecta el `render.yaml` del repo; si preferís configurarlo a mano:
   - **Runtime:** Node · **Build:** `npm install` · **Start:** `node server.js` · **Plan:** Free
4. En **Environment** agregá las variables:
   - `TURSO_DATABASE_URL` = la URL del paso 2
   - `TURSO_AUTH_TOKEN` = el token del paso 2
   - `NODE_ENV` = `production`
5. Deploy. Al terminar tenés una URL pública tipo `https://turnera-san-fernando.onrender.com`.

## Paso 4 — Primer ingreso y seguridad

Usuarios que crea el sistema en el primer arranque:

| Rol | Email | Contraseña inicial |
|---|---|---|
| admin | juanmg1984@gmail.com | `admin1234` |
| coordinador | coordinador@sanfernando.demo | `coord1234` |
| cliente (demo) | demo@americanjet.demo | `cliente1234` |

**Inmediatamente después del primer ingreso:**
1. Entrá como admin → **Maestros → Usuarios** → "Nueva contraseña" para el admin y el coordinador.
2. Desactivá o cambiá la contraseña del cliente demo si no lo vas a usar.

## Paso 5 — Activar el envío de mails (gratis, opcional pero recomendado)

El sistema envía mails para la **gestión de usuarios**: bienvenida con credenciales al crear
un usuario, aviso cuando el admin restablece una contraseña, y el link de
"¿Olvidaste tu contraseña?". Sin configurar, todo funciona igual pero hay que pasar las
credenciales a mano y la recuperación autogestionada queda deshabilitada.

Se usa **[Brevo](https://www.brevo.com)** (plan gratuito: 300 mails/día, sin tarjeta y
**sin necesidad de dominio propio**; se envía por API HTTPS, que no tiene los bloqueos
de SMTP de algunos hostings):

1. Creá la cuenta gratis en [brevo.com](https://www.brevo.com).
2. **Verificá tu remitente:** Settings → *Senders, Domains & Dedicated IPs* → *Senders* →
   agregá tu email (ej. `juanmg1984@gmail.com`); Brevo te manda un mail de confirmación.
3. **Generá la API key:** Settings → *SMTP & API* → pestaña **API Keys** → *Generate a new
   API key* (empieza con `xkeysib-…`).
4. En Render → tu servicio → **Environment**, agregá:
   - `BREVO_API_KEY` = la key del paso 3
   - `MAIL_FROM` = el email verificado del paso 2
   - `MAIL_FROM_NOMBRE` = `Turnos Aeroplanta San Fernando` (opcional)
   - `APP_URL` = la URL pública de tu servicio (ej. `https://turnera-san-fernando.onrender.com`)
     — se usa para armar los links de los mails.
5. Redeploy. En **Configuración** (vista admin) vas a ver "📧 Envío de mails activo".

Para probarlo localmente podés setear las mismas variables antes de arrancar:
```
$env:BREVO_API_KEY = "xkeysib-…"
$env:MAIL_FROM = "juanmg1984@gmail.com"
$env:APP_URL = "http://localhost:8642"
node server.js
```

## Actualizaciones

Cada `git push` a `main` redespliega automáticamente en Render. Los datos viven en Turso,
así que los deploys no borran nada.

## Alternativas si algún día hace falta más

- **Que no se duerma el server:** plan Starter de Render (pago) o un ping periódico externo.
- **Mails automáticos al cliente:** hoy el aviso es dentro de la app (campanita); se puede
  sumar email con [Resend](https://resend.com) (plan gratuito) más adelante.
- **Login con Google:** se puede agregar sobre el login actual sin migrar usuarios.
