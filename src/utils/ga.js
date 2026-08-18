import { GA_MEASUREMENT_ID, SITE } from '../config/site'

const GA_ID_PATTERN = /^G-[A-Z0-9]+$/i

export function isGaReady() {
  return GA_ID_PATTERN.test(GA_MEASUREMENT_ID) && typeof window !== 'undefined'
}

export function initGa() {
  if (!isGaReady() || window.gtag) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)

  window.gtag('js', new Date())
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: true,
    anonymize_ip: true,
    cookie_flags: 'SameSite=None;Secure',
    app_name: SITE.name,
  })
}

export function trackScreen(screenName, title) {
  if (!isGaReady() || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_title: title || SITE.title,
    page_location: SITE.url,
    page_path: '/',
    screen_name: screenName,
  })
  window.gtag('event', 'screen_view', {
    screen_name: screenName,
    app_name: SITE.name,
  })
}

export function trackEvent(name, params = {}) {
  if (!isGaReady() || typeof window.gtag !== 'function') return
  window.gtag('event', name, params)
}
