/**
 * server.js — Punto de entrada del servidor backend.
 *
 * Se encarga de:
 * 1. Cargar las variables de entorno desde el archivo .env
 * 2. Conectarse a la base de datos PostgreSQL usando Sequelize
 * 3. Iniciar el servidor Express en el puerto configurado
 *
 * El esquema de la base de datos ya NO se sincroniza automáticamente acá
 * (se eliminó `sequelize.sync({ alter: true })`, EST-08 Fase 0). Todo
 * cambio de esquema se aplica con `npm run db:migrate` (runner Umzug,
 * scripts/migrate.js), en desarrollo igual que en producción — ver
 * backend/migrations/README.md.
 */

require('dotenv').config();         // Carga las variables de entorno (.env)
const app = require('./app');       // Importa la aplicación Express ya configurada
const { sequelize } = require('./models'); // Importa la instancia de Sequelize
const logger = require('./utils/logger');

// Puerto donde escucha el servidor (por defecto 5000 si no está en .env)
const PORT = process.env.PORT || 5000;

/**
 * Función principal de arranque del servidor.
 * Usa async/await para manejar la conexión a la DB antes de levantar el server.
 */
async function startServer() {
  try {
    // Verifica que la conexión con PostgreSQL esté funcionando
    await sequelize.authenticate();
    logger.info('Conexión a PostgreSQL establecida');

    // Inicia el servidor HTTP en el puerto definido
    app.listen(PORT, () => {
      logger.info({ port: PORT }, `Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'No se pudo iniciar el servidor');
    process.exit(1); // Sale con código de error si algo falla
  }
}

// Ejecuta el arranque
startServer();
