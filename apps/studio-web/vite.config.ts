import { existsSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Apple の製品ベゼル画像は利用条件によりリポジトリに入れず、`npm run bezel:link` で手元にだけ置く
// （README「iPhone のベゼル画像」）。無いときは src/ui/IPhoneFrame.tsx が同じ寸法の簡易フレームを描く。
// scripts/link-iphone-bezel.mjs の BEZEL_FILE と同じ値にする。
const BEZEL_FILE = 'local-bezels/iphone-17-black-portrait.png'
const bezelUrl = existsSync(new URL(`./public/${BEZEL_FILE}`, import.meta.url)) ? `/${BEZEL_FILE}` : null

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __IPHONE_BEZEL_URL__: JSON.stringify(bezelUrl),
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'vendor', test: /[\\/]node_modules[\\/]/ }],
        },
      },
    },
  },
  server: {
    // 本番と同じくWebとAPIを同一オリジンに置くため、開発時はAPIへプロキシする（15 v01 §3）。
    // 接続先は apps/studio-api の launchSettings.json（http プロファイル）。
    proxy: {
      '/api': 'http://localhost:5001',
    },
  },
})
