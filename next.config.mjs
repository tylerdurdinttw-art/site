/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Дев-сервер и прод-сборка живут в разных папках: иначе `next dev` затирает
  // сборку, которой уже отдаёт страницы запущенный `next start`.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Кроме обычной сборки Next кладёт в .next/standalone самодостаточный сервер
  // со своим срезом node_modules — из него собирается лёгкий Docker-образ.
  // На `next start` это не влияет, запуск через pm2 работает как раньше.
  output: 'standalone',
  // Панель за обратным прокси: заголовок с версией наружу не отдаём.
  poweredByHeader: false,
};

export default nextConfig;
