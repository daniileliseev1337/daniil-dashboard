// Конфигурация Tailwind CSS. Самая важная строка здесь — content:
// она говорит Tailwind, в каких файлах искать использованные классы.
// Без неё Tailwind не найдёт классы вида "px-4" в нашем JSX и не
// сгенерирует для них стили — кнопки получатся неоформленными.
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
