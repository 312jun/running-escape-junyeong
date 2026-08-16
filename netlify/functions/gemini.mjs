import { callGemini } from '../../shared/gemini-api.js'

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405)
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

  try {
    const { prompt } = await req.json()
    const result = await callGemini(apiKey, prompt)
    return json(result)
  } catch (err) {
    const status = err.statusCode === 401 ? 401 : err.statusCode === 403 ? 403 : 500
    return json({ error: err.message || String(err) }, status)
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
