import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const publicDir = new URL('../public/', import.meta.url)
const mark = await readFile(new URL('brand-mark.svg', publicDir), 'utf8')
const drawing = mark.replace('<svg ', '<svg x="0" y="0" width="512" height="512" ')
const icon = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" color="#f4f1e8">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#173f35"/>
  ${drawing}
</svg>
`

await writeFile(new URL('favicon.svg', publicDir), icon(true))
for (const [name, size, rounded] of [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['icon-maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
]) {
  const image = new Resvg(icon(rounded), { fitTo: { mode: 'width', value: size } }).render()
  await writeFile(new URL(`icons/${name}`, publicDir), image.asPng())
  console.log(`Generated ${fileURLToPath(new URL(`icons/${name}`, publicDir))} (${size} x ${size})`)
}
