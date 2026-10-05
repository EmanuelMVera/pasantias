# Documentación funcional — SisPasantías

Portal institucional de empleo del Instituto Tecnológico Beltrán: conecta a
**alumnos y egresados** con **empresas aprobadas por el instituto** para
pasantías y primeros empleos. Este documento describe el sistema **tal como
funciona hoy**: quién lo usa, qué puede hacer cada perfil y cuál es el flujo
principal. El detalle de permisos por endpoint está en
[docs/ROLES-Y-PERMISOS.md](docs/ROLES-Y-PERMISOS.md); el despliegue, en
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 1. Idea general

- El **instituto** controla quién participa: da de alta a sus alumnos/egresados
  (importación CSV), aprueba a las empresas y revisa las ofertas antes de
  publicarlas.
- Las **empresas** tienen dos perfiles internos con responsabilidades separadas:
  quien **gobierna** la cuenta (administrador de empresa) y quien **opera** el
  reclutamiento (reclutador).
- Los **candidatos** buscan ofertas, se postulan con su CV y siguen cada proceso.
- Todo pasa por reglas del backend (no solo por lo que muestra la pantalla):
  permisos, transiciones de estado, visibilidad de datos y validación de
  formularios.

## 2. Perfiles

### 2.1 Administrador del Sistema (instituto)

- **Objetivo:** gobernar la plataforma — quién entra, qué se publica y qué pasó.
- **Navegación (barra lateral):** Panel (indicadores y pendientes) ·
  Solicitudes · Empresas · Ofertas · Usuarios · Importar · Auditoría. Las
  notificaciones y la cuenta están en la barra superior.
- **Puede:**
  - importar alumnos/egresados por CSV (con previsualización: errores por fila,
    carrera validada contra el catálogo institucional) y gestionar usuarios;
  - aprobar o rechazar solicitudes de empresas y de reclutadores (al aprobar,
    el sistema crea las cuentas y envía las credenciales por email);
  - marcar empresas como **de confianza** (sus ofertas se publican sin
    moderación previa);
  - moderar ofertas (aprobar, rechazar, pausar);
  - consultar la auditoría (quién hizo qué y cuándo) y exportar estadísticas.
- **No hace:** no publica ofertas ni gestiona candidatos de una empresa.

### 2.2 Administrador de Empresa

- **Objetivo:** gobernar la cuenta de su empresa y supervisar el reclutamiento.
- **Navegación (barra lateral):** Resumen · Ofertas · Candidatos · Equipo ·
  Mi empresa. En la barra superior: mensajes del equipo, notificaciones y el
  menú de cuenta (Seguridad de mi cuenta).
- **Puede:**
  - ver el estado de todas las ofertas y candidatos de la empresa;
  - pausar, reactivar o cerrar ofertas, y **asignar o cambiar el reclutador
    responsable** de una oferta;
  - administrar el equipo: solicitar el alta de reclutadores (los aprueba el
    instituto, o se crean al instante si la empresa es de confianza),
    suspenderlos y enviarles la recuperación de acceso;
  - editar los datos públicos de la empresa (descripción, rubro, sitio web,
    contacto, logo).
- **No hace:** no crea ni edita el contenido de las ofertas, no mueve
  candidatos en el proceso y no chatea con candidatos (eso es operación del
  reclutador).

### 2.3 Reclutador

- **Objetivo:** operar el día a día del reclutamiento de **sus** ofertas.
- **Navegación (barra horizontal):** Inicio ("qué tengo que gestionar hoy") ·
  Mis ofertas · Candidatos · botón **Nueva oferta**. En el menú de usuario:
  Mi perfil · Ver empresa · Seguridad de mi cuenta.
- **Puede:**
  - crear ofertas y editar las que tiene a cargo (si la empresa no es de
    confianza, cada oferta nueva queda pendiente de moderación; editar una
    rechazada la reenvía a revisión);
  - gestionar el proceso de selección de sus ofertas con el **flujo guiado**:
    En revisión → Preseleccionado → Entrevista → Contratado, o No
    seleccionado (también puede retroceder un paso para corregir);
  - dejar notas internas (el candidato nunca las ve) y descargar el CV;
  - chatear con candidatos cuando el estado lo habilita (preseleccionado,
    entrevista o contratado);
  - editar sus datos personales (Mi perfil).
- **No hace:** no ve ofertas ni candidatos de otros reclutadores, no
  administra el equipo ni los datos de la empresa.

### 2.4 Alumno / Egresado

- **Objetivo:** encontrar oportunidades, postularse y seguir sus procesos.
- **Navegación (barra superior):** Inicio · Ofertas · Mis postulaciones ·
  Mi perfil, más Chat y Notificaciones.
- **Inicio:** indicadores desde su punto de vista — *Postulaciones*, *En
  proceso* (en revisión + preseleccionado), *Entrevistas*, *Contratado* —,
  próximos pasos reales (subir el CV, entrevistas, preselecciones,
  notificaciones, perfil incompleto) y ofertas recomendadas.
- **Puede:**
  - buscar ofertas (filtros y recomendadas por perfil) y postularse con una
    carta de presentación opcional — **requiere tener un CV cargado**;
  - seguir cada postulación y chatear con el reclutador responsable cuando el
    estado lo habilita;
  - completar su perfil profesional: presentación, contacto, redes,
    habilidades, idiomas, experiencia, proyectos, certificaciones,
    preferencias, visibilidad, foto, CV y carta de recomendación.
- **Datos institucionales (solo lectura):** nombre, apellido, email, legajo,
  condición (alumno/egresado), carrera y año de egreso los registra el
  instituto; el alumno los ve pero no puede cambiarlos (si falta alguno, la
  pantalla le indica contactar a la institución). El porcentaje de perfil
  completo solo cuenta lo que el alumno puede completar.
- **Visibilidad:** su perfil puede ser público o privado. Un perfil privado
  solo lo ven el propio alumno, el administrador del sistema y las empresas a
  cuyas ofertas se postuló.

### 2.5 Público (sin sesión)

Página de inicio, ingreso, recuperación de contraseña y **formulario de
registro de empresa** (queda como solicitud pendiente; el responsable recibe
un email de confirmación y, si se aprueba, otro con sus datos de acceso).

## 3. Flujo principal

```
Empresa solicita registro ─▶ Instituto aprueba ─▶ Admin de empresa suma reclutadores
        ─▶ Reclutador crea la oferta ─▶ Instituto la modera (o se publica sola si la empresa es de confianza)
        ─▶ Alumno se postula con su CV ─▶ Reclutador avanza el proceso (revisión → preselección → entrevista)
        ─▶ Chat reclutador ↔ candidato ─▶ Contratación (o "No seleccionado")
```

En cada paso el sistema envía las notificaciones correspondientes (en la app y
por email) y deja registro en la auditoría.

## 4. Datos de presentación (demo)

Para la exposición existe un escenario cargado con nombres ficticios del
universo Marvel. **Son solo datos de demostración**: el resto del sistema no
tiene nada temático.

- **Empresa:** S.H.I.E.L.D. (CUIT ficticio formalmente válido).
- **Nick Fury** — administrador de empresa (`empresa@demo.com`).
- **Tony Stark** — reclutador (`reclutador@demo.com`); Thor Odinson y Steve
  Rogers son otros reclutadores del equipo.
- **Peter Parker** — alumno (`alumno@demo.com`).
- **Historia principal:** Tony publica *Pasante en Desarrollo Frontend
  (React)* → el instituto la aprueba → Peter se postula → Tony lo preselecciona,
  lo entrevista y chatean → Peter queda **contratado**.

Las cuentas de la demo aparecen en la pantalla de ingreso del entorno de
demostración; se cargan y verifican con los comandos de `docs/DEPLOYMENT.md`
(sección de datos de demostración).

## 5. Reglas transversales

- **Catálogo único de carreras:** una sola lista institucional
  (`backend/src/data/catalogos.json`, expuesta en `GET /api/catalogos/carreras`)
  alimenta las ofertas, el registro de empresas y la importación CSV.
- **Formatos canónicos:** cada dato se guarda en UNA sola representación y la
  pantalla lo formatea para mostrarlo. CUIT: 11 dígitos sin guiones
  (`30999999979`, se ve `30-99999997-9`). Teléfono: `+54` + 10 dígitos
  (`+541144445555`, se ve `+54 11 4444-5555`; el formulario pide código de área
  y número por separado, sin 0 ni 15). Emails en minúsculas; textos sin
  espacios sobrantes (sin cambiar mayúsculas). La identidad de una empresa es
  su CUIT: no se acepta una solicitud nueva si ya hay una empresa o una
  solicitud pendiente con ese CUIT (una rechazada sí puede volver a presentarse).
- **Validación:** el backend valida todo lo que se guarda (emails, CUIT con
  dígito verificador, teléfonos, URLs, fechas, números y listas cerradas),
  aunque el frontend ya lo haya chequeado.
- **Email:** todos los correos (recuperación, solicitudes, aprobaciones,
  activación de cuentas importadas) pasan por un único servicio; en
  producción se envían por la API de Brevo.
- **Seguridad:** sesión en cookie HttpOnly, contraseñas con hash, recuperación
  de contraseña sin revelar si una cuenta existe, y archivos privados (CV,
  cartas) que solo descargan las personas autorizadas.

## 6. Tecnologías

- **Frontend:** React + Vite.
- **Backend:** Node.js + Express, Sequelize sobre PostgreSQL.
- **Archivos:** almacenamiento local en desarrollo, Cloudflare R2 en producción.
- **Despliegue:** Vercel (frontend), Render (backend), Neon (base de datos),
  Brevo (email).
