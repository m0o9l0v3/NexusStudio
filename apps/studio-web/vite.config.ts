import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 本番と同じくWebとAPIを同一オリジンに置くため、開発時はAPIへプロキシする（15 v01 §3）。
    // 接続先は apps/studio-api の launchSettings.json（http プロファイル）。
    proxy: {
      '/api': 'http://localhost:5001',
    },
  },
})
