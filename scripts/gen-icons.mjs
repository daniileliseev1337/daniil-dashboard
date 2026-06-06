// Генерация PWA-иконок (буква «К» на тёмном фоне) через sharp.
// Запуск: node scripts/gen-icons.mjs
import sharp from 'sharp'

const svg = (s) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
     <rect width="100%" height="100%" rx="${s * 0.18}" fill="#0a0a0a"/>
     <text x="50%" y="54%" font-family="Geist,Arial" font-size="${s * 0.6}" fill="#93c5fd"
       text-anchor="middle" dominant-baseline="middle" font-weight="700">К</text></svg>`
  )

for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['apple-touch-icon', 180],
]) {
  await sharp(svg(size)).png().toFile(`public/${name}.png`)
}
console.log('icons generated')
