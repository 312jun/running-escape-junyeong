import { useEffect, useRef } from 'react'
import { SCREEN_META, SITE } from '../config/site'
import { trackScreen } from '../utils/ga'

export function useScreenMeta(screen) {
  const first = useRef(true)

  useEffect(() => {
    const meta = SCREEN_META[screen] || SCREEN_META.locate
    document.title = meta.title || SITE.title
    if (first.current) {
      first.current = false
      return
    }
    trackScreen(screen, meta.title)
  }, [screen])
}
