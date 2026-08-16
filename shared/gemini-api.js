export const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite']

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** REST 응답에서 최종 텍스트 추출 (output_text는 SDK 전용일 수 있음) */
function extractText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text
  }

  const steps = Array.isArray(data?.steps) ? data.steps : []
  const texts = []

  for (const step of steps) {
    if (step?.type !== 'model_output') continue
    const parts = Array.isArray(step.content) ? step.content : []
    for (const part of parts) {
      if (part?.type === 'text' && typeof part.text === 'string' && part.text) {
        texts.push(part.text)
      }
    }
  }

  return texts.join('\n').trim()
}

export async function callGemini(apiKey, prompt) {
  const key = apiKey?.trim()
  if (!key) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')
  }
  if (!prompt) {
    throw new Error('prompt가 필요합니다.')
  }

  let lastError = null

  for (const model of MODELS) {
    try {
      const res = await fetch(`${API_BASE}/interactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({ model, input: prompt }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`
        const err = new Error(msg)
        err.statusCode = res.status
        throw err
      }

      return {
        text: extractText(data),
        model,
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('모든 모델 호출 실패')
}
