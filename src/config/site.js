export const SITE_URL = 'https://running-escape-junyeong.vercel.app'

export const SITE = {
  name: '한강탈출',
  shortName: '한강탈출',
  url: SITE_URL,
  title: '한강탈출 | 한강·하천 러닝 탈출 코스',
  description:
    '서울 한강·하천 러닝을 끊고 나오는 웹 앱. 위치를 찍고 거리를 고르면, 한강이 가까우면 한강으로, 아니면 근처 하천을 따라 지하철로 탈출하는 코스를 찾아 줍니다.',
  keywords:
    '한강탈출, 한강 러닝, 한강 러닝코스, 서울 러닝, 한강공원, 하천 러닝, 러닝 탈출, 한강 지하철',
  locale: 'ko_KR',
  lang: 'ko',
  themeColor: '#e8eef0',
  backgroundColor: '#e8eef0',
  image: `${SITE_URL}/og-image.jpg`,
  imageAlt: '한강탈출 — 뛰다 · 끊기',
  imageWidth: 1200,
  imageHeight: 630,
  twitterCard: 'summary_large_image',
}

export const SCREEN_META = {
  locate: {
    title: SITE.title,
    path: '/',
  },
  distance: {
    title: '거리 선택 | 한강탈출',
    path: '/',
  },
  escape: {
    title: '탈출 코스 | 한강탈출',
    path: '/',
  },
}

export const GA_MEASUREMENT_ID = String(
  import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-9Y56RNQGY8',
).trim()
