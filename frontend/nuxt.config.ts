export default defineNuxtConfig({
  compatibilityDate: '2026-11-16',
  srcDir: '.',
  devtools: { enabled: false },
  telemetry: false,
  typescript: { strict: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    apiServerBase: `${process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000'}/api`,
    public: { apiBase: '/api' },
  },
  nitro: {
    devProxy: {
      '/api': { target: `${process.env.API_PROXY_TARGET || 'http://localhost:4000'}/api`, changeOrigin: true, xfwd: true },
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'th' },
      title: 'Student Tag · ห้องเรียนของเรา',
      link: [{ rel: 'preload', href: '/fonts/anuphan-variable.ttf', as: 'font', type: 'font/ttf', crossorigin: 'anonymous' }],
      meta: [{ name: 'description', content: 'พื้นที่เรียนรู้สำหรับครูและนักเรียน' }],
    },
  },
});
