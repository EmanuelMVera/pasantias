# Frontend

## 1. ¿Qué es el frontend de este proyecto?
- El frontend es la parte visual de la aplicación, lo que el usuario ve en el navegador.
- Aquí se construye la interfaz con pantallas para alumnos, empresas y admin.
- Permite iniciar sesión, ver ofertas, postularse, crear ofertas y revisar postulantes.

## 2. Objetivo del frontend
- Resuelve el problema de cómo un usuario interactúa con la aplicación.
- Toma entradas del teclado/ratón y muestra datos de la app.
- Rol: muestra datos y envía acciones al backend.
- Diferencia simple:
  - Frontend = pantalla y botones (lo que el usuario toca).
  - Backend = lógica y datos (el "motor" escondido en el servidor).

## 3. Tecnologías y lenguajes usados
- React (librería de JavaScript): construye la interfaz en partes llamadas componentes.
- JavaScript: se usa para la lógica en el navegador.
- Vite: herramienta que arranca el proyecto rápido en modo desarrollo.
- CSS: estilos visuales de los textos, colores y posición de elementos.
- Axios: librería que hace las llamadas al backend (pedir y enviar datos).
- React Router (BrowserRouter, Routes, Route): maneja las páginas según la URL.

## 4. Estructura de carpetas
Árbol principal (solo lo más relevante):
- frontend/
  - index.html
  - package.json
  - vite.config.js
  - src/
    - main.jsx
    - App.jsx
    - App.css
    - index.css
    - assets/
    - components/
    - context/
    - pages/
      - alumno/
      - empresa/
      - admin/
      - auth/
      - placeholder/
    - services/

Explicación carpeta por carpeta:
- `src/`: código fuente principal.
- `components/`: piezas reutilizables (barra de navegación, mensajes, banner).
- `context/`: guarda datos globales compartidos, en este caso `AuthContext` para usuario y token.
- `pages/`: pantallas completas que se muestran según URL.
  - `alumno/`: opciones para estudiantes (ofertas, perfil, postulaciones).
  - `empresa/`: opciones para empresas (crear oferta, ver postulantes).
  - `admin/`: panel de administración.
  - `auth/`: login, registro, recuperación de contraseña.
  - `placeholder/`: página en construcción.
- `services/`: llamadas al backend usando `axios` (`api.js`).
- `assets/`: aquí podrían ir imágenes u otros recursos.

## 5. Archivos más importantes y función de cada uno
- `src/main.jsx`: punto de entrada. Arranca React y carga `App`.
- `src/App.jsx`: define rutas y permisos para cada pantalla, y envuelve con `AuthProvider`.
- `src/context/AuthContext.jsx`: maneja sesión de usuario (login, logout, token, usuario actual).
- `src/services/api.js`: conecta con backend; contiene funciones para auth, ofertas, postulaciones, usuario, notificaciones y admin.
- `src/pages/...`: contienen la lógica de cada sección de la app.
  - Ejemplo: `OfertasPage.jsx` muestra oferta de trabajos y permite acciones.
  - `EmpresaDashboardPage.jsx` y relacionados son para empresa.
  - `AdminDashboardPage.jsx` es para administración.
- `src/components/Navbar.jsx`, `TopBanner.jsx`, `MessageModal.jsx`: componentes decorativos o útiles en varias pantallas.
- `src/App.css` y `src/index.css`: estilos globales.

## 6. Cómo fluye el frontend
1. Al abrir el proyecto en el navegador, `main.jsx` inicia React y pinta `App`.
2. `App.jsx` crea rutas con React Router y usa `AuthProvider` para saber si hay usuario activo.
3. Si el usuario no está logueado, va a `/login` (no hay registro público de alumno/egresado; solo empresas pueden autogestionar su alta vía `/registro-empresa`, con aprobación del admin).
4. Después de login, dependiendo del rol, se redirige a `admin`, `empresa` o `alumno`.
5. Dentro de cada página (por ejemplo `OfertasPage`) se muestran datos y botones.
6. Si hace falta datos del backend, se llama a `services/api.js` con funciones como `ofertaService.getAll()`.
7. Cuando llega la respuesta, React actualiza la pantalla con los datos nuevos.

## 7. Cómo se conecta con el backend
- El proyecto usa `axios` en `src/services/api.js`.
- Base de la API: `VITE_API_URL` o `http://localhost:5000/api`.
- Se envía token en encabezados (`Authorization: Bearer ...`) automáticamente.
- Ejemplo real de llamada:
  - `ofertaService.getAll()` hace `GET /ofertas`.
  - `authService.login({ email, password })` hace `POST /auth/login`.
- El frontend pide datos (GET) y envía cambios (POST/PUT/PATCH/DELETE), el backend responde con JSON.

## 8. Cómo explicarlo en una exposición
- "Este frontend está hecho con React y Vite. En el navegador, `main.jsx` carga `App`, que usa rutas para elegir la pantalla.
- El `AuthContext` guarda el usuario y permite proteger páginas según rol (alumno, empresa, admin).
- Para hablar con el servidor se usa `axios` en `services/api.js`, que organiza comandos como `login`, `getAll`, `postular`.
- Cada carpeta tiene su función: `pages` son pantallas grandes, `components` son partes compartidas, `services` hacen los pedidos de datos." 
- Menciona ejemplos: "si soy alumno, entro a `OfertasPage`; si soy empresa, voy a `EmpresaDashboardPage`."
- Cierra con: "La idea es separar la vista del flujo de datos y usar componentes para no repetir código."

## 9. Resumen rápido
- El frontend es la interfaz para usuario en React.
- Está organizado en rutas, componentes, contexto y servicios.
- Se conecta al backend con axios y usa token para autenticación.
- Resuelve el acceso, visualización y acciones (login, ver ofertas, postular, administrar).
- Es fácil de explicar con el ciclo: arrancar → página → pedir datos → mostrar resultados.

