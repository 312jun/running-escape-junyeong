const KEY = 'hangang-escape:recommend-count'

export function getRecommendCount() {
  try {
    const n = Number(window.localStorage.getItem(KEY))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

export function bumpRecommendCount() {
  const next = getRecommendCount() + 1
  try {
    window.localStorage.setItem(KEY, String(next))
  } catch {
    // private mode / quota
  }
  return next
}
