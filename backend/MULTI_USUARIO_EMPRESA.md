# Multi-usuario por empresa — Documentación Técnica

Una empresa puede tener varios usuarios en su equipo. La matriz de permisos
completa (todos los roles del sistema) vive en **[`docs/ROLES-Y-PERMISOS.md`](../docs/ROLES-Y-PERMISOS.md)**;
este documento se enfoca en la arquitectura del equipo de empresa y sus endpoints.

> Histórico: en v1.5 los roles internos eran `propietario / gerente / reclutador /
> viewer`. En v2.0 se simplificaron a **`admin_empresa` / `reclutador`**. Los tres
> valores viejos siguen atascados en el tipo ENUM original de esa base —
> es la razón por la que hoy `empresa_usuarios.rolInterno` es `STRING` + CHECK y
> no un ENUM (ver `migrations/README.md`).

---

## Arquitectura

```
empresa (1) ───< empresa_usuarios (N) >─── usuario (N)
                        │
                   rolInterno  →  admin_empresa | reclutador
                   activo      →  true | false  (suspensión sin perder historial)
```

`empresa_usuarios` es la fuente de verdad de los permisos dentro de la empresa.
`verifyEmpresaMember` la resuelve en cada request y adjunta `req.empresa` +
`req.miembroEmpresa`. Un usuario que es **dueño directo** de la empresa
(`empresa.usuarioId === req.usuario.id`) obtiene una membresía **virtual**
`admin_empresa` aunque no tenga fila en la tabla.

---

## Roles internos

| Rol | Qué puede hacer |
|---|---|
| `admin_empresa` | Todo lo de la empresa: editar perfil + logo, gestionar el equipo (solicitar reclutadores, cambiar roles, suspender), además de todo lo operativo. |
| `reclutador` | Solo operativo: crear/editar/cerrar ofertas, ver candidatos, mover el embudo de selección, chat. **No** toca equipo ni perfil de empresa. |

Ver la matriz por acción en [`docs/ROLES-Y-PERMISOS.md`](../docs/ROLES-Y-PERMISOS.md) §4.

---

## Alta de un reclutador (la empresa NO crea usuarios)

El `admin_empresa` **solicita** el alta; el **admin del instituto** crea la cuenta
al aprobar.

```
admin_empresa → POST /api/empresas/equipo/solicitar { nombre, apellido, email }
             → queda una SolicitudReclutador 'pendiente' + notificación al admin
admin        → GET  /api/admin/solicitudes-reclutador
             → PATCH /api/admin/solicitudes-reclutador/:id/aprobar
             → se crea Usuario (rol 'empresa') + EmpresaUsuario (rolInterno 'reclutador')
             → el reclutador recibe un link de activación por email para poner su contraseña
```

Rechazo: `PATCH /api/admin/solicitudes-reclutador/:id/rechazar { motivo }` → notifica al `admin_empresa`.

---

## Endpoints del equipo (`/api/empresas/*`)

Todos requieren `verifyToken` + `authorizeRoles('empresa')` + `verifyEmpresaMember`.

| Método | Ruta | Rol interno | Descripción |
|---|---|---|---|
| GET | `/equipo` | cualquiera | Lista miembros (activos e inactivos) |
| GET | `/equipo/solicitudes` | `admin_empresa` | Solicitudes de reclutador de mi empresa |
| POST | `/equipo/solicitar` | `admin_empresa` | Envía la solicitud de alta al admin |
| POST | `/equipo/:id/recuperacion` | `admin_empresa` | Manda email de recuperación de acceso a un miembro (el admin_empresa nunca ve ni elige la contraseña) |
| PATCH | `/equipo/:id` | `admin_empresa` | `{ rolInterno?, activo? }` — cambia rol o suspende |
| DELETE | `/equipo/:id` | `admin_empresa` | Da de baja (soft) un miembro |
| GET | `/mi-empresa` | cualquiera | Datos de la empresa + `rolEnEquipo` del usuario |
| PUT | `/mi-empresa` | `admin_empresa` | Edita el perfil de la empresa |
| POST | `/mi-empresa/logo` | `admin_empresa` | Sube el logo (imagen validada, SEC-03) |
| GET | `/dashboard`, `/mis-ofertas`, `/candidatos` | cualquiera | Paneles de solo lectura |

`EmpresaContext` (frontend) resuelve `rolInterno` una vez por sesión vía
`GET /api/empresas/mi-empresa` y lo usa **solo para decidir qué botones mostrar** —
la autoridad real es `authorizeEmpresaRoles` en el backend.

---

## Registro de la empresa

Ver `README.md` raíz §"Usuarios y accesos" y `docs/ROLES-Y-PERMISOS.md` §2. Resumen:
solicitud pública (`POST /api/solicitudes-empresa`) → aprobación del admin → se
crean `Usuario` (rol `empresa`) + `Empresa` (`estadoAprobacion: 'aprobada'`) +
`EmpresaUsuario` (`admin_empresa`, `activo: true`).
