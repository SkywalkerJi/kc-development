import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // vue() 只用于编译 .vue SFC 供测试导入（同 vite.config.ts 生产构建里的用法），
  // 不影响 .ts 测试文件本身的转换管线。全局 environment 仍是 'node'——真正需要
  // DOM 的测试文件（如 src/views/__tests__/DevelopmentView.spec.ts）用文件顶部的
  // `// @vitest-environment jsdom` 注释单独覆盖，其余测试不受影响。
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts', 'tests/**/*.spec.ts', 'scripts/__tests__/**/*.spec.ts'],
  },
})
