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
      },
    },
    {
      name: "sagarmatha-web",
      cwd: "./frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        BACKEND_URL: "http://127.0.0.1:5000",
        NEXT_PUBLIC_API_URL: "/api",
      },
    },
  ],
};
