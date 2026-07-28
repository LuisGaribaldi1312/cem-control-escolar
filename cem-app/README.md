# CEM · Preinscripciones y Control Escolar

Aplicación completa (backend + base de datos + frontend) para preinscripciones,
folios con código QR, y panel de control escolar del Centro Educativo CEM.

Ya **no depende de Claude para nada**: es un servidor Node.js normal con su
propia base de datos SQLite, que puedes correr en tu propia computadora o
subir a cualquier proveedor de hosting.

---

## 1. Qué incluye

- **Preinscripción pública** (`/#/registro`): modalidad, datos del alumno y
  del tutor, carga de 5 documentos PDF.
- **Folio + código QR** al terminar el registro (`/#/confirmacion`).
- **Consulta del alumno** (`/#/estudiante`): buscar por folio o escanear el QR;
  ver documentos, estatus y pagos; subir documentos que hayan quedado pendientes.
- **Panel administrativo** (`/#/admin`), usuario `admin` / contraseña `12345`
  por defecto:
  - Lista de alumnos con filtros (deben inscripción, activos, suspendidos) y buscador.
  - Ver y descargar cada documento cargado.
  - Marcar inscripción pagada, registrar pagos de colegiatura (día/mes/año/monto),
    ver historial, eliminar pagos.
  - Cambiar el estatus del alumno a **Activo** o **Suspendido**.
  - Exportar todo el listado a un archivo **Excel (.xlsx)**.
  - Cambiar la contraseña del panel y configurar un correo de recuperación.
  - Recuperar contraseña por código enviado **por correo real** (una vez que
    configures un proveedor de correo, ver sección 4).

Base de datos: **SQLite** (un solo archivo, `server/data/cem.db`) — es una base
de datos real, con tablas para alumnos, documentos, pagos y el administrador.
No necesitas contratar un servidor de base de datos aparte.

---

## 2. Probarlo en tu computadora

Necesitas tener instalado [Node.js](https://nodejs.org) (versión 18 o más nueva).

```bash
cd server
npm install
cp .env.example .env
npm start
```

Abre `http://localhost:3000` en tu navegador. El usuario administrador se crea
automáticamente la primera vez que arranca el servidor, usando los valores de
`ADMIN_DEFAULT_USERNAME` y `ADMIN_DEFAULT_PASSWORD` del archivo `.env`
(por defecto: `admin` / `12345`).

**Cambia esa contraseña de inmediato** desde "Mi cuenta" dentro del panel, o
edita el `.env` antes del primer arranque.

---

## 3. Subirlo a GitHub (sin compartir tu contraseña)

GitHub ya no acepta usuario/contraseña para subir código — solo acepta un
**token de acceso personal**. Es más seguro y toma medio minuto crear uno:

1. Entra a GitHub → foto de perfil (esquina superior derecha) → **Settings**.
2. Baja hasta **Developer settings** → **Personal access tokens** →
   **Tokens (classic)** → **Generate new token (classic)**.
3. Dale un nombre (ej. "cem-deploy"), marca el permiso **repo**, genera el
   token y **cópialo** (solo se muestra una vez).
4. Crea un repositorio nuevo y vacío en GitHub (sin README) llamado, por
   ejemplo, `cem-control-escolar`, usando tu usuario `LuisGaribaldi1312`.
5. En tu computadora, dentro de la carpeta de este proyecto:

```bash
git add .
git commit -m "Proyecto inicial CEM"
git branch -M main
git remote add origin https://github.com/LuisGaribaldi1312/cem-control-escolar.git
git push -u origin main
```

Cuando te pida usuario y contraseña: usuario = `LuisGaribaldi1312`,
contraseña = **el token que generaste** (no tu contraseña real de GitHub).

> Este repositorio ya tiene un `.gitignore` que excluye `.env`, la carpeta
> `uploads/` (documentos de los alumnos) y `data/` (la base de datos), para
> que nunca subas información sensible de alumnos ni contraseñas a GitHub.

---

## 4. Publicarlo con tu propio dominio (sin usar Claude)

Cualquier proveedor que corra aplicaciones Node.js funciona. Los más sencillos
para este proyecto son **Render** o **Railway** (tienen plan gratuito/de bajo
costo y despliegan directo desde tu repositorio de GitHub):

1. Crea una cuenta en [render.com](https://render.com) (o railway.app).
2. "New Web Service" → conecta tu repositorio de GitHub `cem-control-escolar`.
3. Configuración:
   - **Root directory:** `server`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. **Muy importante — persistencia de datos:** agrega un **disco persistente**
   (en Render: "Add Disk", móntalo en `/opt/render/project/src/server/data`
   y otro en `.../server/uploads`, o un solo disco que cubra `server/`).
   Sin esto, cada vez que actualices el código se borrarían los alumnos
   registrados y los documentos subidos.
5. En la sección de variables de entorno, copia el contenido de tu `.env`
   (sin subir el archivo `.env` en sí): `JWT_SECRET`, `APP_BASE_URL` (la URL
   final que te dé Render, ej. `https://cem-escuela.onrender.com`),
   `ADMIN_DEFAULT_USERNAME`, `ADMIN_DEFAULT_PASSWORD`, y los datos `SMTP_*`.
6. Despliega. Cuando termine, esa URL ya es tu sitio en vivo — puedes
   conectarle tu propio dominio (ej. `preinscripciones.tuescuela.mx`) desde
   la configuración de dominio personalizado del proveedor.

---

## 5. Activar el envío real de correos

Sin esto configurado, el sistema sigue funcionando normalmente, pero los
correos de confirmación y los códigos de recuperación de contraseña no se
envían (solo quedan anotados en los registros del servidor). Para activarlos,
elige un proveedor y agrega sus datos a las variables `SMTP_*`:

- **Resend** (sencillo, buen nivel gratuito): crea una cuenta en resend.com,
  genera una API key, y usa:
  ```
  SMTP_HOST=smtp.resend.com
  SMTP_PORT=587
  SMTP_USER=resend
  SMTP_PASS=tu_api_key
  ```
- **SendGrid**: crea una cuenta, genera una API key, y usa:
  ```
  SMTP_HOST=smtp.sendgrid.net
  SMTP_PORT=587
  SMTP_USER=apikey
  SMTP_PASS=tu_api_key
  ```

No necesitas tocar el código: solo llenar esas variables donde hayas
desplegado el proyecto (o en tu `.env` local) y reiniciar el servidor.

---

## 6. Seguridad — antes de usarlo con alumnos reales

- Cambia la contraseña `admin`/`12345` inmediatamente.
- Pon un `JWT_SECRET` largo y único (no el de ejemplo).
- Configura el correo de recuperación del administrador desde "Mi cuenta".
- Asegúrate de que el disco con `server/uploads` y `server/data` sea
  **persistente y privado** (solo tu servidor debe poder leerlo).
- Considera hacer respaldos periódicos del archivo `server/data/cem.db` y
  de la carpeta `server/uploads`.

---

## 7. Estructura del proyecto

```
cem-app/
├── .gitignore
├── README.md
└── server/
    ├── package.json
    ├── .env.example
    ├── src/
    │   ├── server.js       (arranca Express, sirve el frontend y la API)
    │   ├── db.js            (SQLite: tablas y datos iniciales)
    │   ├── auth.js           (JWT del panel administrativo)
    │   ├── mailer.js         (envío de correo vía SMTP)
    │   └── routes/
    │       ├── public.js     (registro, consulta de folio, documentos)
    │       └── admin.js      (login, listado, pagos, estatus, exportar Excel)
    ├── public/
    │   └── index.html        (todo el frontend: inicio, registro, consulta, panel)
    ├── data/                 (se crea sola — base de datos SQLite)
    └── uploads/              (se crea sola — PDFs de los alumnos)
```
