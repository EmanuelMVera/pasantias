# Migraciones SQL — Sistema de Pasantías

Esta carpeta contiene los scripts de migración para aplicar cambios de esquema en la base de datos **sin perder datos**.

## ¿Cuándo usar estos scripts?

- **En desarrollo**: el servidor aplica los cambios automáticamente con `sequelize.sync({ alter: true })` al arrancar. No es necesario correr los scripts manualmente.
- **En producción**: ejecutar los scripts **antes** de reiniciar el servidor con la nueva versión del código.

---

## Scripts disponibles

| Archivo | Versión | Descripción |
|---------|---------|-------------|
| `001_add_campos_usuario.sql` | v1.1 | Agrega `profesor` al ENUM de `rol` + campos `telefono`, `ubicacion`, `ultimoAcceso`, `fotoPerfil` |
| `002_add_campos_perfil.sql` | v1.1 | Agrega 8 campos nuevos a `perfiles`: `portfolio`, `preferenciasLaborales`, `salarioPretendido`, `visibilidadPerfil`, `experienciaLaboral`, `proyectos`, `certificaciones`, `redesSociales` |

---

## Cómo ejecutar en producción

### Opción 1 — psql (recomendado)

```bash
# Conectarse a la base de datos y ejecutar cada script en orden
psql -U postgres -d pasantias_db -f migrations/001_add_campos_usuario.sql
psql -U postgres -d pasantias_db -f migrations/002_add_campos_perfil.sql
```

### Opción 2 — DBeaver / pgAdmin

1. Abrir la conexión a la base de datos
2. Abrir cada archivo `.sql` con **File → Open SQL Script**
3. Ejecutar con **F5** o el botón de "Run Script"

---

## ⚠️ Notas importantes

- Los scripts son **idempotentes**: pueden ejecutarse múltiples veces sin romper nada. Usan `ADD COLUMN IF NOT EXISTS` y verificaciones previas para el ENUM.
- El ENUM de PostgreSQL **no es reversible** fácilmente. Una vez agregado el valor `'profesor'`, no se puede quitar sin recrear el tipo.
- Siempre hacer un **backup** de la DB antes de correr migraciones en producción.
