// Конфигурация Vite — современного быстрого сборщика для React-приложений.
// Подключаем единственный плагин — поддержку JSX-синтаксиса React.
// Никаких дополнительных настроек нам не нужно: Vite по умолчанию умеет
// всё, что требуется для нашего проекта.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: null, // SW регистрируем вручную в App.jsx
      manifest: false,      // используем статический public/manifest.webmanifest
      injectManifest: { swSrc: 'src/sw.js', swDest: 'dist/sw.js' },
      devOptions: { enabled: false },
    }),
  ],
});
