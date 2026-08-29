# Frontend — SPA

Interfaz web del Sistema de Gestión de Pasantías. Single Page Application que
consume la API REST del backend.

> Instalación y puesta en marcha: ver el [`README.md`](../README.md) de la raíz.
> Este documento describe la **arquitectura** del frontend.

---

## 1. Stack

| Pieza | Para qué |
|---|---|
| **React 19** | Librería de UI por componentes |
| **Vite 8** | Dev server + bundler |
| **React Router 7** | Ruteo por URL (`BrowserRouter`) |
| **Axios** | Cliente HTTP hacia la API (`src/services/api.js`) |
| **Recharts** | Gráficos de los dashboards |
| **ESLint 9** | Lint (`npm run lint`, bloqueante en CI) |

Sin librería de estado global: alcanza con Context + hooks. Estilos en CSS plano
(módulos `*.module.css` + tokens globales en `src/styles/`).

---

## 2. Estructura de `src/`

```
src/
├── main.jsx              Monta React y envuelve la app en <BrowserRouter>
├── App.jsx               <AuthProvider> + <EmpresaProvider> + <Routes> + ProtectedRoute
├── pages/
│   ├── auth/             LoginPage, ForgotPasswordPage, ResetPasswordPage, SolicitudEmpresaPage
│   ├── alumno/           Dashboard, OfertasPage, OfertaDetallePage, MisPostulacionesPage, PerfilPage, PerfilPublicoPage
│   ├── empresa/          Dashboard, CrearOfertaPage, PostulantesMiOfertaPage, EquipoPage, MiEmpresaPage, CandidatosEmpresaPage, SeguridadPage
│   ├── admin/            AdminDashboardPage, AdminUsuariosPage, AdminOfertasPage, AdminSolicitudesPage, AdminLogsPage
│   ├── HomePage.jsx      Landing pública
│   ├── ChatPage.jsx      Mensajería
│   └── NotificacionesPage.jsx
├── components/           Navbar, NavbarPublic, Avatar, Modal, Paginacion, TopBanner
├── context/
│   ├── AuthContext.jsx     <AuthProvider> — usuario logueado, login/logout, helpers de rol
│   └── EmpresaContext.jsx  <EmpresaProvider> — empresa y rol interno del usuario
├── hooks/
│   ├── useAuth.js          Consume AuthContext (archivo aparte por Fast Refresh)
│   ├── useEmpresa.js       Consume EmpresaContext
│   └── usePaginacion.js    Manejo de ?page= en listados
├── services/
│   └── api.js              Instancia axios + un *Service por recurso (authService, ofertaService…)
├── constants/             postulacionEstados.js (labels/colores del embudo)
├── utils/                 passwordStrength.js
├── styles/                variables.css (tokens), globals.css
└── assets/                imágenes / estáticos
```

> Los hooks `useAuth` / `useEmpresa` viven en `src/hooks/` y **no** en el archivo
> del context: así cada `*Context.jsx` exporta solo su Provider y Fast Refresh
> (HMR) no recarga toda la app al editarlos (regla `react-refresh/only-export-components`).

---

## 3. Autenticación y guardias de ruta

- **Sesión en cookie HttpOnly** (SEC-02). El frontend **no** guarda ningún token:
  `api` usa `withCredentials: true` y el navegador manda la cookie sola. Al cargar
  la app, `AuthContext` llama `GET /api/auth/me` — un 401 = "sin sesión".
- **CSRF**: `api.js` lee la cookie del token CSRF y la reenvía como header
  `X-CSRF-Token` en `POST/PUT/PATCH/DELETE` (double-submit).
- **`ProtectedRoute`** (`App.jsx`): si no hay `usuario` redirige a `/`; si el rol
  no está en `roles={[...]}` redirige también. Tras el login, cada rol aterriza en
  su home (`getRutaInicio`): alumno/egresado → `/dashboard`, empresa → `/empresa`,
  admin → `/admin`.
- **`EmpresaContext` / `useEmpresa()`**: resuelve el rol interno
  (`admin_empresa` / `reclutador`) una vez por sesión para **decidir qué mostrar**
  (botones de gestión de equipo, edición del perfil de empresa…). No es autoridad
  de permisos — el backend siempre revalida con `authorizeEmpresaRoles`.

Rutas públicas (sin login): `/`, `/login`, `/registro-empresa`, `/forgot-password`,
`/reset-password/:token`, y el listado/detalle de ofertas a nivel API.

Matriz de permisos completa: [`../docs/ROLES-Y-PERMISOS.md`](../docs/ROLES-Y-PERMISOS.md).

---

## 4. Cómo se consume la API

- Todo pasa por `src/services/api.js`. **Los componentes nunca llaman a axios
  directo** — usan `ofertaService.getAll()`, `authService.login(...)`, etc.
- `baseURL`: `import.meta.env.VITE_API_URL` o, por defecto, `http://localhost:5000/api`
  (llamada absoluta al backend; **no** se usa el proxy de Vite).
- Interceptor de respuesta: un `401` limpia la sesión y manda a `/login`.
- Archivos privados (CV, cartas): no son URLs públicas. Se piden a
  `GET /api/archivos/:id` como `blob` con `abrirArchivoPrivado()` y se abren/descargan
  desde memoria (un `<a href>` plano no manda la cookie en una navegación).
- Contrato de respuesta del backend: `{ success, message?, data?, pagination? }`.
  Listados paginados: `?page=&limit=` → `pagination: { page, limit, total, totalPages }`
  (componente `<Paginacion>` + `usePaginacion`).

---

## 5. Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Dev server de Vite en `:5173` (HMR) |
| `npm run build` | Build de producción a `dist/` |
| `npm run preview` | Sirve el `dist/` para probarlo |
| `npm run lint` | ESLint sobre todo `src/` — **debe pasar** (gate de CI) |

No hay tests unitarios de frontend; la cobertura end-to-end la dan los smoke tests
de Playwright en [`../e2e/`](../e2e/) (levantan front + back reales).

---

## 6. Variables de entorno

Solo una, opcional en local: **`VITE_API_URL`** (ver [`.env.example`](.env.example)).
Si se omite, `api.js` usa `http://localhost:5000/api`. En producción se apunta a la
URL pública del backend, incluyendo el prefijo `/api`.

---

## 7. Resumen

SPA React + Vite. Ruteo con React Router y `ProtectedRoute` por rol. Sesión en
cookie HttpOnly (sin token en el cliente) + CSRF double-submit. Toda la
comunicación con el backend centralizada en `services/api.js`. Estado global
acotado a dos contexts (auth y empresa). Lint bloqueante; E2E con Playwright.
