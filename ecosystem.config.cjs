const {
  frontendPort,
  backendPort,
  mongoPort,
  backendUrl,
} = require("./ports.config.cjs");

module.exports = {
  apps: [
    {
      name: "sagarmatha-api",
      cwd: "./backend",
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: String(backendPort),
        BACKEND_PORT: String(backendPort),
        FRONTEND_PORT: String(frontendPort),
        MONGODB_PORT: String(mongoPort),
      },
    },
    {
      name: "sagarmatha-web",
      cwd: "./frontend",
      script: "node_modules/next/dist/bin/next",
      args: `start -H 0.0.0.0 -p ${frontendPort}`,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: String(frontendPort),
        FRONTEND_PORT: String(frontendPort),
        BACKEND_PORT: String(backendPort),
        BACKEND_URL: backendUrl,
        NEXT_PUBLIC_API_URL: "/api",
      },
    },
  ],
};
