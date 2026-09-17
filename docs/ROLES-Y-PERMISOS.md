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
| `verifyEmpresaMember` | `middleware/empresa.middleware.js` | Resuelve la empresa del usuario y adjunta `req.empresa` + `req.miembroEmpresa`. Si el usuario es dueño directo (`empresa.usuarioId === req.usuario.id`) crea una membresía **virtual** con `rolInterno: 'admin_empresa'`. 404 si no tiene ninguna empresa. |
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
| Editar mi perfil académico, subir CV / carta / foto | — | — | ✅ | — | — |
| Ver perfil público de otro usuario / de una empresa | — | ✅ | ✅ | ✅ | ✅ |

### Ofertas

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Ver listado y detalle de ofertas (activas + moderadas) | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 |
| Ver ofertas recomendadas para mi perfil | — | — | ✅ | — | — |
| Crear una oferta (`POST /api/ofertas`) | — | — | — | — | ✅ |
| Editar el contenido de una oferta (`PUT /api/ofertas/:id`) | — | — | — | — | ✅¹ |
| Pausar / reactivar una oferta (`PATCH /api/ofertas/:id/estado`) | — | — | — | ✅² | ✅¹ |
| Cerrar una oferta (`PATCH /api/ofertas/:id/estado`) | — | — | — | ✅² | ✅¹ |
| Moderar una oferta (aprobar / pausar / rechazar) | — | ✅ | — | — | — |

¹ El reclutador solo sobre su propia oferta (`creadaPorUsuarioId === req.usuario.id`)
o sobre una oferta histórica sin responsable registrado (`creadaPorUsuarioId IS NULL`,
anterior a la migración 013) — nunca sobre la de otro reclutador.
² `admin_empresa` puede pausar/reactivar/cerrar **cualquier** oferta de su empresa
(control institucional, sin importar quién la creó) pero **nunca** crea una ni edita
su contenido — la cuenta empresa es una entidad institucional, no publica ofertas
operativas (feedback de la profesora, iteración RBAC-01). Toda transición de estado
queda auditada con `pausar_oferta` / `reactivar_oferta` / `cerrar_oferta`, marcando
`esOverrideInstitucional: true` en el detalle cuando el actor no es el responsable.

### Postulaciones

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Postularme a una oferta | — | — | ✅ | — | — |
| Ver "Mis Postulaciones" | — | — | ✅ | — | — |
| Ver candidatos de una oferta / de mi empresa | — | — | — | ✅ | ✅ |
| Cambiar el estado de una postulación (embudo de selección) | — | — | — | ✅ | ✅ |

### Empresa — perfil y equipo

| Acción | público | admin | alumno / egresado | admin_empresa | reclutador |
|---|:--:|:--:|:--:|:--:|:--:|
| Ver dashboard / mis-ofertas / mi-empresa / equipo | — | — | — | ✅ | ✅ |
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
| Logs de auditoría: ver / exportar | — | ✅ | — | — | — |
| Importación masiva de alumnos/egresados por CSV (plantilla, dry-run, confirmar) | — | ✅ | — | — | — |

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

- **El propietario directo de una empresa siempre pasa como `admin_empresa`**,
  aunque no tenga fila en `empresa_usuarios` (membresía virtual en
  `verifyEmpresaMember`). Cuentas creadas antes del sistema multi-usuario siguen
  funcionando así.
- **`reclutador` no puede tocar el equipo ni el perfil de la empresa**, solo lo
  operativo: ofertas, candidatos, embudo de selección, chat.
- El rol interno **no** se puede elevar a `admin_empresa` desde el panel de empresa;
  el `admin_empresa` puede cambiar el rol de un miembro entre los valores válidos
  pero no puede quitarse a sí mismo la condición de dueño.
- Toda acción sensible (aprobaciones, cambios de rol, moderación, borrados) queda
  en `activity_logs` vía `registrarAuditoria` — ver [`../backend/README.md`](../backend/README.md) §Observabilidad.
- **Reasignación de ofertas entre reclutadores (mejora futura, no implementada):**
  hoy `oferta.creadaPorUsuarioId` es el único campo de responsable — alcanza para
  "el creador edita, cualquiera puede tomar una histórica sin dueño". Si en el
  futuro se necesita transferir una oferta activa de un reclutador a otro, hace
  falta una columna nueva `asignadaAUsuarioId` (nullable, migración aparte) — no
  se agregó ahora porque no hay un caso de uso concreto que la requiera.
