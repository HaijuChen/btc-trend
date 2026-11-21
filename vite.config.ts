import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const svg = readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf8').trim()
        const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        return html.replace(/href="(?:\.\/)?favicon\.svg"/, `href="${href}"`)
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    base: './',
    plugins: [
      react(),
      ...(single
        ? [inlineFavicon(), viteSingleFile({ removeViteModuleLoader: true, outputFileName: 'btc-trend.html' })]
        : []),
    ],
    build: single ? { outDir: 'dist-single', emptyOutDir: true } : undefined,
    server: {
      host: '0.0.0.0',
      port: 4179,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 4179,
      strictPort: true,
    },
  }
})
