/**
 * server.js — Punto de entrada del servidor backend.
 *
 * Se encarga de:
 * 1. Cargar las variables de entorno desde el archivo .env
 * 2. Validar la configuración (falla al arrancar en producción si falta algo)
 * 3. Conectarse a la base de datos PostgreSQL usando Sequelize
 * 4. Iniciar el servidor Express en el puerto configurado
 * 5. Apagar de forma ordenada ante SIGTERM/SIGINT (Render reinicia con SIGTERM)
 *
 * El esquema de la base de datos ya NO se sincroniza automáticamente acá
 * (se eliminó `sequelize.sync({ alter: true })`, EST-08 Fase 0). Todo
 * cambio de esquema se aplica con `npm run db:migrate` (runner Umzug,
 * scripts/migrate.js), en desarrollo igual que en producción — ver
 * backend/migrations/README.md.
 */

require('dotenv').config();         // Carga las variables de entorno (.env)
const { config, validateEnv } = require('./config/env');
const app = require('./app');       // Importa la aplicación Express ya configurada
const { sequelize } = require('./models'); // Importa la instancia de Sequelize
const logger = require('./utils/logger');
const { seedPresentacionSiFalta } = require('./utils/seedPresentacion');

// Si está activado (por defecto: solo en desarrollo), al arrancar se verifica
// que el escenario de demo para la presentación esté cargado y, si falta, se
// siembra. En producción NUNCA (ver también el guard dentro de la función).
const SEED_ON_BOOT = config.seed.presentacionOnBoot;

// Puerto: Render (y otras PaaS) inyectan PORT — no fijarlo en el entorno.
const PORT = config.port;

/**
 * Función principal de arranque del servidor.
 * Usa async/await para manejar la conexión a la DB antes de levantar el server.
 */
async function startServer() {
  try {
    // DEPLOY-01: en producción, aborta el arranque si falta configuración
    // obligatoria (JWT_SECRET, CLIENT_URL, DB, config de S3 si STORAGE_BACKEND=s3…).
    // Nunca imprime el valor de un secreto.
    const warnings = validateEnv();
    warnings.forEach((w) => logger.warn(w));

    // Verifica que la conexión con PostgreSQL esté funcionando
    await sequelize.authenticate();
    logger.info('Conexión a PostgreSQL establecida');

    // Escenario de demo: carga las semillas de presentación si faltan.
    // No bloquea el arranque si algo falla (la función traga sus errores).
    if (SEED_ON_BOOT) {
      await seedPresentacionSiFalta(logger);
    }

    // Inicia el servidor HTTP en el puerto definido
    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, `Servidor escuchando en el puerto ${PORT}`);
    });

    // Apagado ordenado: dejar de aceptar conexiones nuevas, terminar las en
    // curso y cerrar el pool de Postgres antes de salir.
    const cerrar = (senal) => {
      logger.info({ senal }, 'Apagando servidor…');
      server.close(() => {
        sequelize.close().finally(() => process.exit(0));
      });
      // Red de seguridad: si algo queda colgado, salir igual.
      setTimeout(() => process.exit(0), 10000).unref();
    };
    process.on('SIGTERM', () => cerrar('SIGTERM'));
    process.on('SIGINT', () => cerrar('SIGINT'));
  } catch (error) {
    logger.fatal({ err: error }, 'No se pudo iniciar el servidor');
    process.exit(1); // Sale con código de error si algo falla
  }
}

// Ejecuta el arranque
startServer();
