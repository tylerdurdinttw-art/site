/**
 * Конфиг pm2 для запуска без Docker: `pm2 start ecosystem.config.js`.
 *
 * Один процесс намеренно: rate-limit и шина событий (SSE) держатся в памяти
 * процесса, на нескольких воркерах они разъедутся. Под кластер сначала нужен
 * Redis — см. lib/rateLimit.ts и lib/eventBus.ts.
 */
module.exports = {
  apps: [
    {
      name: 'quickpanel',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '600M',
      autorestart: true,
      time: true,
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
    },
  ],
};
