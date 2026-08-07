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

  // SKIP_TYPECHECK=true выключает проверку типов и линт во время сборки.
  //
  // Ставится только на слабых серверах: это самая прожорливая фаза `next build`,
  // ей нужно около гигабайта, и на VPS с 1 ГБ она уходит в обмен на десятки минут.
  // Типы от этого не перестают проверяться — их гоняет `npm run typecheck`
  // на машине разработчика, где памяти достаточно. Не включайте это там, где
  // сборка заодно служит проверкой перед выкладкой.
  typescript: { ignoreBuildErrors: process.env.SKIP_TYPECHECK === 'true' },
  eslint: { ignoreDuringBuilds: process.env.SKIP_TYPECHECK === 'true' },
};

export default nextConfig;
