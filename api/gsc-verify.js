const BODY = 'google-site-verification: google58998bce76133af0.html'

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('X-Robots-Tag', 'noindex')
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  res.statusCode = 200
  res.end(BODY)
}
