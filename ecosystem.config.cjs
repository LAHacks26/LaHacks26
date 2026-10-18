// pm2 process for the production VM (started by scripts/deploy.sh).
// Next listens on localhost only; Caddy (deploy/Caddyfile) is the public entry point.
module.exports = {
  apps: [
    {
      name: "saffron",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
    },
  ],
};
