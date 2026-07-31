import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // 必须与 GitHub Pages 实际服务的路径一致，也就是仓库名（项目页服务在
  // https://<域名>/<仓库名>/ 下）。base 是**构建期**烘进 dist/index.html 的
  // 绝对路径，不在运行时推导：一旦这里与真实路径对不上，HTML 本身仍然
  // 200，但它引用的 /assets/*.js 全部 404，#app 没有任何东西挂载，页面表现
  // 为纯白、且没有任何可见报错——2026-07-31 仓库从 kc-development 改名为
  // kc-development-tools 时就是这个症状。
  //
  // 同一个路径在仓库里还有两份必须同步的副本，改这里就要一起改：
  //   - scripts/verify-render.mjs 的 BASE_PATH（拼验证用的 URL）
  //   - public/404.html 的 baseUrl（Pages 的 SPA 回退跳转；public/ 下的文件
  //     由 vite 原样拷贝，读不到任何构建期常量，只能硬编码）
  // 注意 src/i18n/index.ts 的 STORAGE_KEY = 'kc-development.locale' 虽然也含
  // 旧仓库名，但那是 localStorage 的键，改了会清空所有老用户存的语言选择，
  // 不要跟着改。
  base: process.env.NODE_ENV === 'production' ? '/kc-development-tools/' : '/',
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
