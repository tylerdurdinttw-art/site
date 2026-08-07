/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Дев-сервер и прод-сборка живут в разных папках: иначе `next dev` затирает
  // сборку, которой уже отдаёт страницы запущенный `next start`.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Самодостаточный сервер в .next/standalone нужен только Docker-образу: из него
  // выходит ~40 МБ вместо гигабайта. Включается переменной, которую ставит Dockerfile.
  //
  // По умолчанию выключен намеренно: `next start` со standalone не работает, а
  // запуск через pm2 (ecosystem.config.js) идёт именно через `next start`.
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' } : {}),
  // Панель за обратным прокси: заголовок с версией наружу не отдаём.
  poweredByHeader: false,
};

export default nextConfig;
