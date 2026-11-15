// Apple の製品ベゼル画像（Apple Design Resources「Product Bezels」）を、手元のフォルダから
// public/local-bezels/ へそのままコピーする。画像は Apple の利用条件によりリポジトリに入れない（README「iPhone のベゼル画像」）。
// 使い方: npm run bezel:link   （置き場所が違うときは STUDIO_IPHONE_BEZEL_DIR=<PNGフォルダ> npm run bezel:link）
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// vite.config.ts の BEZEL_FILE と同じ値にする。
const BEZEL_FILE = 'local-bezels/iphone-17-black-portrait.png'
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 既定はリポジトリの1つ上（Nexus フォルダ）に展開したダウンロード。
const sourceDir = resolve(process.env.STUDIO_IPHONE_BEZEL_DIR ?? join(webRoot, '../../../iPhone17-product-bezels/PNG'))
const source = join(sourceDir, 'iPhone 17', 'iPhone 17 - Black - Portrait.png')
if (!existsSync(source)) {
  console.error(`ベゼル画像が見つかりません: ${source}`)
  console.error('https://developer.apple.com/design/resources/ の Product Bezels（iPhone 17）を展開し、STUDIO_IPHONE_BEZEL_DIR にその PNG フォルダを指定してください。')
  process.exit(1)
}
const target = join(webRoot, 'public', BEZEL_FILE)
mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)
console.log(`コピーしました: ${target}\n開発サーバーを起動し直すと Events の iOS Preview に表示されます。`)
