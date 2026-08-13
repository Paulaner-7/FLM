import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Connect, type Plugin } from 'vite'

// https://vite.dev/config/

/**
 * FLM — serve i CSV di bootstrap dalla cartella docs/ come asset statici.
 * In dev risponde su /docs/… via middleware; in build li emette in dist/docs/.
 * I nomi devono combaciare con DOCS_CSV in src/db/autoimport.ts.
 */
const DOCS_CSV = [
  'Players - PES 2021 - Edit.csv',
  'Teams - PES 2021 - Edit.csv',
  'Teams-Players - PES 2021 - Edit.csv',
] as const

function docsCsvPlugin(): Plugin {
  const docsDir = resolve(import.meta.dirname, 'docs')
  const nomiServiti: readonly string[] = DOCS_CSV

  return {
    name: 'flm-docs-csv',
    configureServer(server) {
      server.middlewares.use((req: Connect.IncomingMessage & IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        const pathname = decodeURIComponent((req.url ?? '').split('?')[0] ?? '')
        if (!pathname.startsWith('/docs/')) return next()
        const nome = pathname.slice('/docs/'.length)
        if (!nomiServiti.includes(nome)) return next()
        try {
          const data = readFileSync(resolve(docsDir, nome))
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/csv; charset=utf-8')
          res.setHeader('Content-Length', data.length)
          res.setHeader('Cache-Control', 'no-cache')
          res.end(data)
        } catch {
          res.statusCode = 404
          res.end('CSV non trovato')
        }
      })
    },
    generateBundle() {
      for (const nome of DOCS_CSV) {
        this.emitFile({
          type: 'asset',
          fileName: `docs/${nome}`,
          source: readFileSync(resolve(docsDir, nome)),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), docsCsvPlugin()],
})
