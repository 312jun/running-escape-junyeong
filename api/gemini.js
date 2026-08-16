import { callGemini } from '../shared/gemini-api.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'POST only' }))
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.statusCode = 503
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY가 없습니다.' }))
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const result = await callGemini(apiKey, body.prompt)
    res.statusCode = 200
    res.end(JSON.stringify(result))
  } catch (err) {
    res.statusCode = err.statusCode && err.statusCode < 600 ? err.statusCode : 500
    res.end(JSON.stringify({ error: err.message || String(err) }))
  }
}
