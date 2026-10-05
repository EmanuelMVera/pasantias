# Roles y permisos — Sistema de Pasantías IT Beltrán

Documento canónico de autorización. Refleja el estado del código en
`backend/src/middleware/` y `backend/src/routes/`. Si una ruta y esta tabla no
coinciden, **manda el código** — actualizá el documento.

---

## 1. Dos niveles de rol

| Nivel | Dónde vive | Valores | Para qué |
|---|---|---|---|
| **Rol de sistema** | `usuarios.rol` (`STRING` + CHECK) | `admin`, `alumno`, `egresado`, `empresa` | Qué flujos de la app puede usar la cuenta. Lo chequea `authorizeRoles(...)`. |
| **Rol interno de empresa** | `empresa_usuarios.rolInterno` (`STRING` + CHECK) | `admin_empresa`, `reclutador` | Qué puede hacer un usuario `empresa` **dentro de su empresa**. Lo chequea `authorizeEmpresaRoles(...)`. |

- `alumno` y `egresado` tienen **exactamente los mismos permisos**. La diferencia
  es informativa (egresado = ya recibido).
- Un usuario con rol de sistema `empresa` **siempre** tiene además un rol interno:
  `admin_empresa` (dueño de la cuenta) o `reclutador`.
- No hay ENUM de Postgres en estas columnas: ver
  [`../backend/migrations/README.md`](../backend/migrations/README.md) §"Por qué los ENUMs viejos siguen físicamente en la base"
  para el historial de `profesor` / `propietario` / `gerente` / `viewer` (valores
  legacy, hoy muertos e inertes).

---

## 2. Cómo se crea cada rol

**No hay autorregistro público.** El sistema es una bolsa de empleo institucional.

| Rol | Cómo se crea la cuenta |
|---|---|
| `admin` | Primer admin (y opcionalmente un segundo, vía `SEED_SECOND_ADMIN_*`): `cd backend && npm run db:seed:admin` — ver `docs/DEPLOYMENT.md` §3.A.1. Admins adicionales: otro admin desde `Admin → Usuarios`. |
| `alumno` / `egresado` | Un admin los da de alta (`Admin → Usuarios → Nuevo`, `POST /api/admin/usuarios`). |
| `empresa` + `admin_empresa` | La empresa manda una **solicitud pública** (`/registro-empresa` → `POST /api/solicitudes-empresa`). Un admin la aprueba y en ese momento se crean `Usuario` (rol `empresa`) + `Empresa` + `EmpresaUsuario` (`admin_empresa`). |
| `empresa` + `reclutador` | El `admin_empresa` manda una **solicitud de reclutador** (`POST /api/empresas/equipo/solicitar`). Un admin la aprueba y crea `Usuario` + `EmpresaUsuario` (`reclutador`). La empresa nunca crea usuarios directamente. |

Flags de cuenta:

- `usuarios.activo` — `false` = cuenta desactivada, no puede iniciar sesión (soft ban).
- `usuarios.habilitado` — para empresas: `false` hasta que el admin aprueba.
- `empresa_usuarios.activo` — `false` = miembro suspendido; conserva el historial.
- `empresas.estadoAprobacion` — `pendiente` | `aprobada` | `rechazada`. Solo las
  `aprobada` pueden publicar ofertas y aparecer en el perfil público.

---

## 3. Middlewares

| Middleware | Archivo | Qué hace |
|---|---|---|
| `verifyToken` | `middleware/auth.middleware.js` | Lee el JWT de la **cookie `token`** (HttpOnly; fallback header `Authorization: Bearer` para tests/clientes API), valida firma + `tokenVersion`, carga `req.usuario`. |
| `authorizeRoles(...roles)` | `middleware/auth.middleware.js` | 403 si `req.usuario.rol` no está en la lista. |
| `verifyEmpresaMember` | `middleware/empresa.middleware.js` | Resuelve la empresa del usuario y adjunta `req.empresa` + `req.miembroEmpresa`, exclusivamente a partir de una membresía activa en `empresa_usuarios`. 404 (`SIN_EMPRESA`) si no tiene ninguna. |
| `authorizeEmpresaRoles(...roles)` | `middleware/empresa.middleware.js` | 403 si `req.miembroEmpresa.rolInterno` no está en la lista. Usar **después** de `verifyEmpresaMember`. |

En el frontend, el equivalente son `ProtectedRoute` (rol de sistema) y
`EmpresaContext` / `useEmpresa()` (rol interno, solo para decisiones de UI — **no**
es autoridad de permisos).

---

## 4. Matriz de permisos

`✅` = permitido · `—` = 403/404 · `🌐` = público (sin login)

### Cuenta y sesión

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Login / logout / forgot-reset password | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 |
| Ver mi usuario (`GET /api/auth/me`), cambiar mi contraseña | — | ✅ | ✅ | ✅ | ✅ |
| Ver mi perfil académico (`GET /api/users/perfil`) | — | ✅ | ✅ | ✅ | ✅ |
| Editar mi perfil profesional, subir CV / carta / foto | — | — | ✅¹² | — | — |
| Cambiar datos institucionales del alumno (carrera, año de egreso, legajo, nombre, email, rol) | — | ✅ (admin / importación CSV) | — (400) | — | — |
| Consultar el catálogo de carreras (`GET /api/catalogos/carreras`) | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 |
| Ver perfil público de otro usuario / de una empresa | — | ✅ | ✅¹⁰ | ✅¹⁰ | ✅¹⁰ |
| Ver la ficha de un reclutador (`GET /api/empresas/reclutadores/:id/perfil`) | — | ✅ | ✅ con relación⁵ | ✅ misma empresa | ✅ misma empresa |
| Mi perfil: ver / editar nombre, apellido, teléfono y ubicación; subir foto (`/api/empresas/reclutadores/mi-perfil[/foto]`) | — | — | — | — (403) | ✅ solo el propio⁹ |

### Ofertas

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Ver listado y detalle de ofertas (activas + moderadas) | 🌐 | 🌐 | 🌐¹¹ | 🌐 | 🌐 |
| Ver ofertas recomendadas para mi perfil | — | — | ✅ | — | — |
| Crear una oferta (`POST /api/ofertas`) | — | — | — | — | ✅ |
| Editar el contenido de una oferta (`PUT /api/ofertas/:id`) | — | — | — | — | ✅¹ |
| Pausar / reactivar una oferta (`PATCH /api/ofertas/:id/estado`) | — | — | — | ✅² | ✅¹ |
| Cerrar una oferta (`PATCH /api/ofertas/:id/estado`) | — | — | — | ✅² | ✅¹ |
| Asignar / cambiar el reclutador responsable de una oferta (`PATCH /api/empresas/ofertas/:id/responsable`) | — | — | — | ✅⁴ | — |
| Moderar una oferta (aprobar / pausar / rechazar) | — | ✅ | — | — | — |

¹ El reclutador solo sobre las ofertas a su cargo (`creadaPorUsuarioId === req.usuario.id`) —
nunca sobre la de otro reclutador. Una oferta **sin responsable** (`creadaPorUsuarioId IS NULL`)
no la edita ni la opera ningún reclutador hasta que el `admin_empresa` le asigne uno (ya no
existe el fallback "cualquier reclutador"). Editar una oferta **rechazada** la reenvía a
revisión (`pendiente` + aviso al instituto), también en empresas de confianza.
² `admin_empresa` puede pausar/reactivar/cerrar **cualquier** oferta de su empresa
(control institucional, sin importar quién la creó) pero **nunca** crea una ni edita
su contenido — la cuenta empresa es una entidad institucional, no publica ofertas
operativas (feedback de la profesora, iteración RBAC-01). Toda transición de estado
queda auditada con `pausar_oferta` / `reactivar_oferta` / `cerrar_oferta`, marcando
`esOverrideInstitucional: true` en el detalle cuando el actor no es el responsable.

⁴ Acción de gobierno: solo cambia el responsable (`creadaPorUsuarioId`), nunca el
contenido de la oferta ni sus postulaciones. El responsable tiene que ser un
**reclutador activo de la misma empresa** (membresía activa `reclutador` + cuenta
activa y habilitada): no puede ser el `admin_empresa`, un reclutador suspendido ni
alguien de otra empresa. Notifica al nuevo responsable y, si sigue activo, al
anterior. Queda auditado como `asignar_responsable_oferta` /
`reasignar_responsable_oferta` (oferta, responsable anterior y nuevo, quién lo hizo).

### Postulaciones

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Postularme a una oferta | — | — | ✅ | — | — |
| Ver "Mis Postulaciones" | — | — | ✅ | — | — |
| Ver candidatos de una oferta / de mi empresa | — | — | — | ✅ (todas) | ✅ (solo sus ofertas) |
| Cambiar el estado de una postulación (flujo guiado⁶) | — | — | — | — (supervisa) | ✅ (responsable de la oferta) |
| Nota interna de una postulación (`notasEmpresa`) | — | — | — (nunca la ve) | lectura | ✅ escribir (responsable) |
| Historial de estados de una postulación (`GET /api/postulaciones/:id/historial`) | — | — | — | ✅ | ✅ (responsable) |
| Recibir el aviso de "nueva postulación" | — | — | — | solo como respaldo³ | ✅ (responsable de la oferta) |

³ El aviso de una nueva postulación va al **reclutador responsable** de la oferta
(`creadaPorUsuarioId` con membresía activa `reclutador` en esa empresa). Solo si la
oferta no tiene un responsable válido (histórica sin responsable, responsable
suspendido o que ya no es reclutador) se avisa a los `admin_empresa` activos. Nunca
a ambos. Ver `obtenerDestinatariosPostulacion` en `backend/src/services/empresa.service.js`.

⁵ Un alumno/egresado ve la ficha de un reclutador solo si puede ver la conversación
de chat con él (misma regla de `chatPermission.service.js`: una postulación suya
avanzó bajo la responsabilidad de ese reclutador). El endpoint responde el mismo 404
si el usuario no existe, no es un reclutador activo o no hay relación — no permite
enumerar reclutadores.

⁶ Transiciones permitidas: en revisión → preseleccionado | no seleccionado;
preseleccionado → entrevista | no seleccionado | en revisión; entrevista → contratado |
no seleccionado | preseleccionado; no seleccionado → en revisión (reabrir); contratado es
final. Otra transición responde 400 `TRANSICION_NO_PERMITIDA`.

⁷ `GET /api/empresas/dashboard`, `/mis-ofertas`, `/candidatos` y
`GET /api/postulaciones/oferta/:id` aplican el alcance del actor ANTES de cualquier
filtro: el reclutador recibe solo lo de las ofertas a su cargo (el dashboard le devuelve
su panel personal, `alcance: "reclutador"`), y el proceso de una oferta ajena o sin
responsable le responde 403 `NO_ES_RESPONSABLE`. Si el `admin_empresa` reasigna una
oferta, el alcance cambia en la próxima consulta.

### Empresa — perfil y equipo

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Ver dashboard / mis-ofertas / candidatos | — | — | — | ✅ toda la empresa | ✅ solo lo suyo⁷ |
| Ver mi-empresa / equipo (API) | — | — | — | ✅ | ✅ (consulta)⁸ |
| Pantalla Equipo (`/empresa/equipo`) | — | — | — | ✅ | — (redirige a `/empresa`) |
| Filtrar ofertas y candidatos por estado, moderación u oferta | — | — | — | ✅ | ✅ (dentro de su alcance) |
| Filtrar por responsable | — | — | — | ✅ | — (se ignora) |
| Editar el perfil de la empresa, subir logo | — | — | — | ✅ | — |
| Solicitar el alta de un reclutador (al admin) | — | — | — | ✅ | — |
| Ver las solicitudes de reclutador de mi empresa | — | — | — | ✅ | — |
| Enviar email de recuperación de acceso a un miembro | — | — | — | ✅ | — |
| Cambiar rol / suspender / dar de baja un miembro | — | — | — | ✅ | — |

### Alta de empresas y reclutadores

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Enviar una solicitud de registro de empresa | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 |
| Listar / aprobar / rechazar solicitudes de empresa | — | ✅ | — | — | — |
| Listar / aprobar / rechazar solicitudes de reclutador | — | ✅ | — | — | — |

### Administración del instituto (`/api/admin/*`)

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Dashboard general, stats, actividad reciente | — | ✅ | — | — | — |
| Usuarios: listar / ver / crear / editar / borrar (soft) / activar-desactivar | — | ✅ | — | — | — |
| Empresas pendientes: listar / aprobar / rechazar | — | ✅ | — | — | — |
| Ofertas: listar todas / ver pendientes / moderar | — | ✅ | — | — | — |
| Logs de auditoría: ver / exportar (CSV / Excel / PDF) | — | ✅ | — | — | — |
| Estadísticas profesionales: ver / exportar (Excel / PDF) | — | ✅ | — | — | — |
| Importación masiva de alumnos/egresados por CSV (plantilla, dry-run, confirmar) | — | ✅ | — | — | — |

Exportaciones (`/api/admin/logs/export`, `/api/admin/estadisticas/export`): rate-limit
dedicado (20/hora por usuario), límite duro de 5000 filas, cada exportación queda
auditada (`exportar_logs` / `exportar_estadisticas`, con formato y filtros usados —
nunca el contenido exportado). Ver `backend/src/services/export.service.js`.

### Chat, notificaciones, archivos privados

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Chat: buscar usuarios, conversaciones, enviar, historial | — | ✅¹ | ✅¹ | ✅¹ | ✅¹ |
| Notificaciones propias: listar / contar / marcar / borrar | — | ✅ | ✅ | ✅ | ✅ |
| Descargar un archivo privado (`GET /api/archivos/:id`) | — | ✅² | ✅² | ✅² | ✅² |

¹ Cualquiera autenticado, pero `chatPermission.service.js` restringe **con quién**
se puede iniciar conversación (p. ej. una empresa solo con alumnos que postularon
a sus ofertas).
² Autenticado + autorización fina en `archivo.controller.js`: solo el **propietario**
del archivo, un **admin**, o una **empresa** que tenga una postulación del alumno a
una de sus ofertas.

---

## 5. Notas de diseño

- **`empresa_usuarios` es la única fuente de verdad de quién representa a una
  empresa** (RBAC-06). `Empresa` ya no tiene ninguna referencia directa a
  `Usuario` — no existe ningún "dueño implícito" ni membresía virtual; toda
  empresa tiene garantizada al menos una fila `admin_empresa` activa desde la
  migración 019.
- **`reclutador`: workspace operativo personal; no administra el equipo.** Crea
  ofertas (queda como responsable), edita / pausa / reactiva / cierra las suyas,
  gestiona sus candidatos con el flujo guiado, escribe notas internas, consulta el
  historial, ve perfiles, chatea con candidatos cuando las reglas lo permiten,
  consulta su empresa (perfil público, `/empresa/:id`) y recibe notificaciones
  operativas. No toca el equipo, los responsables ni el perfil de la empresa, y no
  ve estadísticas corporativas. Su alcance es PERSONAL y lo impone el backend
  (nota ⁷): no ve ofertas ni candidatos de otros reclutadores, ni de ofertas sin
  responsable. En el frontend no tiene sección Equipo: su barra es Inicio · Mis
  ofertas · Candidatos + "Nueva oferta", y el menú de usuario ofrece Mi perfil,
  Ver empresa y Seguridad de mi cuenta.
- ⁹ **Mi perfil del reclutador** (`/empresa/mi-perfil`): whitelist estricta
  (`nombre`, `apellido`, `telefono`, `ubicacion`; cualquier otro campo → 400).
  Email, rol, empresa, estado y contraseña no se editan ahí (la contraseña vive en
  Seguridad). La foto se sube como imagen validada (JPG/PNG/WEBP, 2 MB, magic bytes)
  y se guarda en `Usuario.fotoPerfil`: los reclutadores no tienen Perfil académico.
- ¹⁰ **Perfil privado** (`visibilidadPerfil=false`): responde 403 `PERFIL_PRIVADO`
  salvo para el propio alumno (vista previa), el admin del sistema y los integrantes
  activos de una empresa a cuyas ofertas se postuló — postularse es compartir el
  perfil con esa empresa.
- ¹¹ Con sesión de alumno/egresado el detalle (`GET /api/ofertas/:id`) agrega
  `miPostulacion` y `cvCargado`, y quien ya se postuló sigue viendo la oferta aunque
  esté pausada o cerrada (para el resto es 404).
- ¹² **Datos institucionales del alumno** (nombre, apellido, email, rol, legajo, carrera,
  año de egreso): los administra el instituto (importación CSV o admin del sistema). El
  alumno los ve en solo lectura y `PUT /api/users/perfil` los rechaza con 400 ("El campo …
  es administrado por el instituto"). Para postularse se exige un CV real (Archivo
  registrado, `cvArchivoId`), no un `cvPath` legacy suelto.
- ⁸ `GET /api/empresas/equipo` sigue respondiendo al reclutador (lectura de la
  nómina, sin datos de gestión); todas las acciones de equipo (`solicitudes`,
  `solicitar`, `recuperacion`, `PATCH`/`DELETE` de miembros) son solo `admin_empresa`.
- **Cerrar una oferta** corta las postulaciones nuevas pero no el proceso de
  selección: su responsable puede seguir moviendo a quienes ya se postularon (y
  consultar historial y notas) desde Mis ofertas → Gestionar candidatos.
- **Flujo guiado del proceso de selección** (nota ⁶): el backend valida cada cambio
  de estado; el frontend solo ofrece las transiciones que el backend devuelve en
  `transicionesPermitidas`.
- **Nota interna** (`notasEmpresa`): una sola nota editable por postulación, la
  escribe el reclutador responsable, la lee el `admin_empresa`; nunca se envía al
  candidato (los endpoints del alumno la omiten) ni genera notificación.
- **`admin_empresa`: gobierno y supervisión del equipo; no opera**: ve todas las
  ofertas y candidatos de la empresa, edita el perfil y el logo, administra el
  equipo, asigna responsables y puede pausar / reactivar / cerrar cualquier oferta
  de su empresa, pero no crea ni edita ofertas ni mueve candidatos en el embudo. En
  el frontend tiene un shell propio (sidebar + topbar, `EmpresaShell`) con Resumen,
  Ofertas, Candidatos, Equipo y Mi empresa; el reclutador usa su barra horizontal
  (`ReclutadorNav`). Esa separación es de presentación: la autoridad sigue siendo
  `authorizeEmpresaRoles` en el backend.
- **Notificaciones de empresa:** la nueva postulación va al reclutador responsable
  (ver nota ³); el resultado de la moderación de una oferta va a los
  `admin_empresa` **y** al reclutador responsable, sin duplicar.
- **Perfil público de empresa** (`GET /api/empresas/:id`): solo lista ofertas
  visibles (activas y con moderación `aprobada` / `auto_aprobada`), el mismo
  criterio que el listado público de ofertas.
- **Contraseñas:** mínimo 8 caracteres en todos los flujos que fijan una
  contraseña (cambio, recuperación, alta/edición desde el admin, seed de admins).
  El login no valida largo: las cuentas con claves anteriores más cortas siguen
  pudiendo ingresar.
- El rol interno **no** se puede elevar a `admin_empresa` desde el panel de empresa;
  el `admin_empresa` puede cambiar el rol de un miembro entre los valores válidos
  pero no puede quitarse a sí mismo la condición de dueño.
- Toda acción sensible (aprobaciones, cambios de rol, moderación, borrados) queda
  en `activity_logs` vía `registrarAuditoria` — ver [`../backend/README.md`](../backend/README.md) §Observabilidad.
- **Responsable de una oferta:** `oferta.creadaPorUsuarioId` es el único campo de
  responsable. Nace con el reclutador que crea la oferta y el `admin_empresa`
  puede asignarlo o cambiarlo (ver nota ⁴). El nombre de la columna quedó
  histórico: hoy significa "reclutador responsable", no necesariamente "quien la
  creó". Las ofertas históricas sin responsable siguen en `NULL` hasta que un
  `admin_empresa` las asigne a mano — no hay backfill automático. Cambiar el
  responsable traslada todo lo que depende de ese campo: quién edita la oferta y
  gestiona sus candidatos, quién recibe las postulaciones nuevas y con quién
  pueden chatear los candidatos.
- **Perfiles según identidad:** un `admin_empresa` representa a la entidad y se
  lo muestra con el perfil de la empresa (`/empresa/:id`); un `reclutador` es una
  persona de la empresa y tiene su ficha (`/reclutador/:usuarioId`, solo consulta).
  El chat decide el destino del botón de perfil por `rolInterno`, nunca solo por
  el rol global `empresa`.
