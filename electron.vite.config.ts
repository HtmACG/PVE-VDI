import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['ws', 'semver'] })],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    /**
     * @xterm/xterm@6.0.0 发布的是「已经压缩过」的 ESM。
     * 如果产物再做一次标识符压缩，InputHandler.requestMode 的闭包参数会被改名漏掉，
     * 运行时抛 ReferenceError（vim / htop 等一发 DCS 就崩，开发模式不复现）。
     * electron-vite 默认 minify=false，这里显式写死，防止以后调整构建配置时踩到。
     * 上游 issue：https://github.com/xtermjs/xterm.js/issues/5800
     */
    plugins: [react(), tailwindcss()],
    build: {
      minify: false,
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    }
  }
})
