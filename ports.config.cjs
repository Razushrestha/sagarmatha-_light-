/**
 * Three separate services, three ports (all well above 16).
 * Override with FRONTEND_PORT, BACKEND_PORT, MONGODB_PORT.
 */
const frontendPort = Number(process.env.FRONTEND_PORT || 3016);
const backendPort = Number(process.env.BACKEND_PORT || process.env.PORT || 5000);
const mongoPort = Number(process.env.MONGODB_PORT || 27017);
const mongoHost = process.env.MONGODB_HOST || "127.0.0.1";
const mongoDb = process.env.MONGODB_DB || "sagarmatha_light_solution";

module.exports = {
  frontendPort,
  backendPort,
  mongoPort,
  mongoHost,
  mongoDb,
  frontendUrl: process.env.FRONTEND_URL || `http://127.0.0.1:${frontendPort}`,
  backendUrl: process.env.BACKEND_URL || `http://127.0.0.1:${backendPort}`,
  mongoUri:
    process.env.MONGODB_URI ||
    `mongodb://${mongoHost}:${mongoPort}/${mongoDb}`,
};
