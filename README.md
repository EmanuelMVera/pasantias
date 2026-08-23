# 🎓 SisPasantías — Manual de Instalación

Sistema de gestión de pasantías institucionales — Instituto Tecnológico Beltrán.

---

## 📋 Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Clonar el repositorio](#2-clonar-el-repositorio)
3. [Configurar PostgreSQL](#3-configurar-postgresql)
4. [Configurar variables de entorno](#4-configurar-variables-de-entorno)
5. [Instalar dependencias](#5-instalar-dependencias)
6. [Iniciar el proyecto](#6-iniciar-el-proyecto)
7. [Verificar que funciona](#7-verificar-que-funciona)
8. [Usuarios y accesos](#8-usuarios-y-accesos)
9. [Problemas frecuentes](#9-problemas-frecuentes)

---

## 1. Requisitos previos

Instalá estas herramientas **en orden** antes de continuar:

### Node.js (v18 o superior)
1. Ir a https://nodejs.org
2. Descargar la versión **LTS** (recomendada)
3. Instalar con todas las opciones por defecto
4. Verificar: abrir una terminal y escribir:
   ```
   node --version
   npm --version
   ```
   Debe mostrar algo como `v20.x.x` y `10.x.x`

### PostgreSQL (v14 o superior)
1. Ir a https://www.postgresql.org/download/windows/
2. Descargar el instalador de **EDB** (el oficial)
3. Durante la instalación:
   - Dejar el puerto por defecto: **5432**
   - Crear una contraseña para el usuario `postgres` — **anotarla**, la vas a necesitar
   - Instalar también **pgAdmin 4** (incluido en el instalador)
4. Verificar que el servicio esté corriendo (en Windows: Servicios → `postgresql-x64-xx` → Estado: En ejecución)

### Git
1. Ir a https://git-scm.com/download/win
2. Instalar con las opciones por defecto

---

## 2. Clonar el repositorio

Abrí una terminal (PowerShell o CMD) en la carpeta donde querés guardar el proyecto y ejecutá:

```bash
git clone https://github.com/lucashmercado/pasantias.git
cd pasantias
```

---

## 3. Configurar PostgreSQL

### Crear la base de datos

**Opción A — pgAdmin (interfaz gráfica):**
1. Abrir pgAdmin 4
2. En el panel izquierdo: clic derecho en **Databases** → **Create** → **Database...**
3. En el campo **Database**: escribir `pasantias_db`
4. Clic en **Save**

**Opción B — línea de comandos:**
```bash
# Abrir el cliente psql (viene con PostgreSQL)
psql -U postgres
```
Cuando pida la contraseña, ingresá la que pusiste al instalar PostgreSQL. Luego:
```sql
CREATE DATABASE pasantias_db;
\q
```

---

## 4. Configurar variables de entorno

En la carpeta `backend/` hay un archivo llamado `.env.example`. Hay que copiarlo y editarlo:

**En PowerShell:**
```powershell
Copy-Item backend\.env.example backend\.env
```

**En CMD:**
```cmd
copy backend\.env.example backend\.env
```

Ahora abrí el archivo `backend/.env` con cualquier editor de texto (Bloc de notas, VS Code, etc.) y completá los campos:

```env
NODE_ENV=development
PORT=5000

# Base de datos — cambiá DB_PASSWORD por tu contraseña de PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pasantias_db
DB_USER=postgres
DB_PASSWORD=TU_CONTRASEÑA_AQUI

# JWT — podés dejar estos valores como están
JWT_SECRET=pasantias_jwt_secret_2026_muy_seguro
JWT_EXPIRES_IN=7d

# Email — dejar vacío si no querés configurar emails (el sistema funciona igual)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=

# Frontend URL — no cambiar
CLIENT_URL=http://localhost:5173
```

> ⚠️ **Solo tenés que cambiar `DB_PASSWORD`** por la contraseña que pusiste al instalar PostgreSQL. Lo demás puede quedar como está.

---

## 5. Instalar dependencias

Ejecutá estos comandos **uno por uno** desde la carpeta raíz del proyecto (`pasantias/`):

```bash
# 1. Dependencias raíz (script que levanta todo junto)
npm install

# 2. Dependencias del backend
cd backend
npm install
cd ..

# 3. Dependencias del frontend
cd frontend
npm install
cd ..
```

---

## 6. Iniciar el proyecto

Desde la carpeta raíz del proyecto, ejecutá:

```bash
npm run dev
```

Este comando levanta **backend y frontend al mismo tiempo**.

Vas a ver algo así en la terminal:

```
[backend]  Server corriendo en http://localhost:5000
[frontend] Local: http://localhost:5173
```

> La primera vez que se inicia, el backend **crea automáticamente todas las tablas** en la base de datos. Puede tardar unos segundos.

---

## 7. Verificar que funciona

Abrí el navegador y entrá a:

| URL | Qué debería mostrar |
|---|---|
| http://localhost:5173 | Página de inicio del sistema |
| http://localhost:5173/login | Formulario de login |
| http://localhost:5000/api/health | `{"status":"OK", ...}` |

Si las tres funcionan, ¡el proyecto está corriendo correctamente! ✅

---

## 8. Usuarios y accesos

No existe autorregistro público de alumnos/egresados: el sistema funciona como bolsa de empleo institucional y las cuentas se cargan desde el panel de administración. La base de datos empieza vacía. Para crear el primer usuario administrador:

```bash
cd backend
npm run db:seed:admin
```

Esto crea (si no existe todavía) el usuario `admin@pasantias.com` / `Admin1234!` con rol `admin`. Iniciá sesión con esas credenciales; desde ese panel se pueden cargar el resto de los usuarios `alumno`/`egresado` y gestionar las solicitudes de empresa.

### Roles disponibles

| Rol | Acceso | Cómo crearlo |
|---|---|---|
| `admin` | Panel completo de administración | `npm run db:seed:admin` (primer admin) o creado por otro admin |
| `alumno` / `egresado` | Dashboard de alumno, ofertas, perfil | Alta desde el panel admin (`Admin → Usuarios → Nuevo usuario`, `POST /api/admin/usuarios`) |
| `empresa` | Panel de empresa, ofertas, equipo | Solicitud en `/registro-empresa` + aprobación del admin |
| `empresa` (reclutador) | Gestión de candidatos | Solicitud desde panel de empresa + aprobación del admin |

---

## 9. Problemas frecuentes

### ❌ `password authentication failed for user "postgres"`
**Causa:** La contraseña en `backend/.env` no coincide con la de PostgreSQL.  
**Solución:** Abrir `backend/.env` y corregir `DB_PASSWORD`.

---

### ❌ `database "pasantias_db" does not exist`
**Causa:** No se creó la base de datos.  
**Solución:** Seguir el [paso 3](#3-configurar-postgresql) y crear `pasantias_db`.

---

### ❌ `Cannot find module` al iniciar el backend
**Causa:** No se instalaron las dependencias del backend.  
**Solución:**
```bash
cd backend
npm install
cd ..
```

---

### ❌ Puerto 5000 o 5173 en uso
**Causa:** Otro programa está usando ese puerto.  
**Solución:**
- Para cambiar el puerto del backend: editar `PORT=5001` en `backend/.env`
- Para cambiar el puerto del frontend: editar `frontend/vite.config.js` y agregar `server: { port: 5174 }`

---

### ❌ Error al iniciar `npm run dev` en la raíz
**Causa:** No se instalaron las dependencias raíz.  
**Solución:**
```bash
npm install
```
Verificar que existe `node_modules/` en la carpeta raíz del proyecto.

---

### ❌ El frontend carga pero no conecta con el backend
**Causa:** El backend no está corriendo o está en otro puerto.  
**Solución:**
1. Verificar que el backend esté activo: http://localhost:5000/api/health
2. Verificar que `CLIENT_URL=http://localhost:5173` esté en `backend/.env`

---

## 📁 Estructura del proyecto

```
pasantias/
├── backend/                 # API REST (Node.js + Express + Sequelize)
│   ├── src/
│   │   ├── controllers/     # Lógica de negocio
│   │   ├── models/          # Modelos de la base de datos (Sequelize)
│   │   ├── routes/          # Endpoints de la API
│   │   ├── middleware/      # Autenticación y permisos
│   │   └── server.js        # Punto de entrada del backend
│   ├── uploads/             # Archivos subidos (CVs, fotos) — se crea automáticamente
│   ├── .env                 # Variables de entorno — NO se sube a GitHub
│   └── .env.example         # Plantilla de variables de entorno
│
├── frontend/                # Aplicación web (React + Vite)
│   └── src/
│       ├── pages/           # Páginas por rol (alumno, empresa, admin, auth)
│       ├── components/      # Componentes reutilizables (Navbar, etc.)
│       └── services/        # Comunicación con la API (api.js)
│
├── .gitignore               # Archivos excluidos del repositorio
├── package.json             # Script raíz: npm run dev
└── README.md                # Este archivo
```

---

## 🔧 Comandos útiles

```bash
# Iniciar todo el proyecto (desde la raíz)
npm run dev

# Iniciar solo el backend
cd backend && npm run dev

# Iniciar solo el frontend
cd frontend && npm run dev

# Ver los últimos cambios del repositorio
git log --oneline -10

# Actualizar el código con los últimos cambios del equipo
git pull origin main
```