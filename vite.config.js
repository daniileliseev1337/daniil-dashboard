// Конфигурация Vite — современного быстрого сборщика для React-приложений.
// Подключаем единственный плагин — поддержку JSX-синтаксиса React.
// Никаких дополнительных настроек нам не нужно: Vite по умолчанию умеет
// всё, что требуется для нашего проекта.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
