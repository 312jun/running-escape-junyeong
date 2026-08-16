import { callGemini } from '../shared/gemini-api.js'

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export function geminiProxy(apiKey) {
  return {
    name: 'gemini-proxy',
    configureServer(server) {
      if (!apiKey) {
        console.warn('[gemini-proxy] API key 없음 — .env에 GEMINI_API_KEY를 넣으면 됩니다')
      } else {
        console.log('[gemini-proxy] /api/gemini 준비됨 (키는 서버에서만 사용)')
      }

      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'POST only' }))
          return
        }

        if (!apiKey) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'GEMINI_API_KEY가 없습니다. .env에 넣어 주세요.' }))
          return
        }

        try {
          const raw = await readBody(req)
          const { prompt } = JSON.parse(raw)
          const result = await callGemini(apiKey, prompt)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (err) {
          console.error('[gemini-proxy]', err.message || err)
          res.statusCode = err.statusCode && err.statusCode < 600 ? err.statusCode : 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || String(err) }))
        }
      })
    },
  }
}
