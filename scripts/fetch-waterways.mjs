/** One-off: Nominatim stream lines + Overpass subway stations. */
import { writeFileSync } from 'fs'

const STREAM_NAMES = [
  '청계천',
  '중랑천',
  '안양천',
  '탄천',
  '양재천',
  '홍제천',
  '성내천',
  '도림천',
  '불광천',
  '우이천',
  '반포천',
  '고덕천',
  '성북천',
  '정릉천',
  '당현천',
  '목감천',
]

const UA = 'running-escape-junyeong (https://github.com/312jun/running-escape-junyeong)'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)))
}

function pathLen(points) {
  let km = 0
  for (let i = 0; i < points.length - 1; i += 1) km += haversineKm(points[i], points[i + 1])
  return km
}

function downsample(points, minKm = 0.15) {
  if (!points?.length) return []
  const out = [points[0]]
  for (const p of points.slice(1)) {
    if (haversineKm(out[out.length - 1], p) >= minKm) out.push(p)
  }
  const last = points[points.length - 1]
  if (haversineKm(out[out.length - 1], last) > 0.04) out.push(last)
  return out
}

function clipSeoul(points) {
  return points.filter((p) => p.lat >= 37.42 && p.lat <= 37.71 && p.lng >= 126.76 && p.lng <= 127.19)
}

function coordsToPoints(coords) {
  if (!Array.isArray(coords) || !coords.length) return []
  if (typeof coords[0][0] === 'number') {
    return coords.map(([lng, lat]) => ({ lat, lng }))
  }
  return coords.flatMap(coordsToPoints)
}

function stitch(segs) {
  const items = segs.filter((pts) => pts.length >= 2).map((pts) => ({ pts, used: false }))
  if (!items.length) return []
  const chains = []
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].used) continue
    items[i].used = true
    let chain = [...items[i].pts]
    let grew = true
    while (grew) {
      grew = false
      const head = chain[0]
      const tail = chain[chain.length - 1]
      for (const seg of items) {
        if (seg.used) continue
        const a = seg.pts[0]
        const b = seg.pts[seg.pts.length - 1]
        if (haversineKm(tail, a) < 0.08) {
          chain = chain.concat(seg.pts.slice(1))
          seg.used = true
          grew = true
          break
        }
        if (haversineKm(tail, b) < 0.08) {
          chain = chain.concat([...seg.pts].reverse().slice(1))
          seg.used = true
          grew = true
          break
        }
        if (haversineKm(head, b) < 0.08) {
          chain = seg.pts.slice(0, -1).concat(chain)
          seg.used = true
          grew = true
          break
        }
        if (haversineKm(head, a) < 0.08) {
          chain = [...seg.pts].reverse().slice(0, -1).concat(chain)
          seg.used = true
          grew = true
          break
        }
      }
    }
    chains.push(chain)
  }
  chains.sort((a, b) => pathLen(b) - pathLen(a))
  return chains[0] || []
}

function orientWestToEast(points) {
  if (points.length < 2) return points
  return points[0].lng <= points[points.length - 1].lng ? points : [...points].reverse()
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return res.json()
}

async function fetchStream(name) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${name} 서울`)
  url.searchParams.set('format', 'geojson')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('limit', '8')
  url.searchParams.set('countrycodes', 'kr')
  url.searchParams.set('viewbox', '126.76,37.71,127.19,37.42')
  url.searchParams.set('bounded', '1')
  const data = await fetchJson(url)
  const segs = []
  for (const f of data.features || []) {
    const cat = f.properties?.category
    const type = f.properties?.type
    const n = String(f.properties?.name || f.properties?.display_name || '')
    const water = cat === 'waterway' || type === 'stream' || type === 'river' || type === 'canal'
    if (!water && !n.includes(name)) continue
    if (cat === 'highway') continue
    const geom = f.geometry
    if (!geom) continue
    const pts = clipSeoul(coordsToPoints(geom.coordinates))
    if (pts.length >= 2) segs.push(pts)
  }
  const raw = orientWestToEast(stitch(segs))
  const points = downsample(raw, 0.16)
  return { name, km: Number(pathLen(points).toFixed(2)), n: points.length, points }
}

async function fetchStations() {
  const q = `[out:json][timeout:45];node["station"="subway"](37.43,126.78,37.701,127.18);out;`
  const res = await fetch('https://overpass.private.coffee/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': UA,
    },
    body: `data=${encodeURIComponent(q)}`,
  })
  if (!res.ok) throw new Error(`stations ${res.status}`)
  const data = await res.json()
  const byName = new Map()
  for (const el of data.elements || []) {
    const name = String(el.tags?.name || '').replace(/\s+/g, '')
    if (!name) continue
    const lat = Number(el.lat)
    const lng = Number(el.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const lineRaw = el.tags?.['ref'] || el.tags?.line || el.tags?.network || ''
    const lines = String(lineRaw)
      .split(/[;,/]/)
      .map((s) => s.replace(/서울지하철|서울|호선|Line|Metro/gi, '').trim())
      .filter((s) => s && s.length < 12)
      .slice(0, 4)
    const prev = byName.get(name)
    if (!prev) {
      byName.set(name, { name, type: 'subway', lines: lines.length ? lines : ['지하철'], lat, lng })
      continue
    }
    const merged = [...new Set([...(prev.lines || []), ...lines])].filter((s) => s !== '지하철')
    prev.lines = merged.length ? merged.slice(0, 4) : prev.lines
  }
  return [...byName.values()]
}

async function lookupRelation(osmId, name) {
  const url = new URL('https://nominatim.openstreetmap.org/lookup')
  url.searchParams.set('osm_ids', `R${osmId}`)
  url.searchParams.set('format', 'geojson')
  url.searchParams.set('polygon_geojson', '1')
  const data = await fetchJson(url)
  const segs = []
  for (const f of data.features || []) {
    const pts = clipSeoul(coordsToPoints(f.geometry?.coordinates))
    if (pts.length >= 2) segs.push(pts)
  }
  const raw = orientWestToEast(stitch(segs))
  const points = downsample(raw, 0.16)
  return { name, km: Number(pathLen(points).toFixed(2)), n: points.length, points }
}

const streams = []
for (const name of STREAM_NAMES) {
  try {
    const row = await fetchStream(name)
    console.error(`${name}: ${row.n} pts ${row.km}km`)
    if (row.n >= 6 && row.km >= 1) streams.push(row)
  } catch (err) {
    console.error(`${name} FAIL ${err.message}`)
  }
  await sleep(1100)
}

for (const [id, name] of [
  [19282613, '안양천'],
  [19279176, '탄천'],
]) {
  try {
    const row = await lookupRelation(id, name)
    console.error(`${name} rel: ${row.n} pts ${row.km}km`)
    if (row.n >= 8 && row.km >= 1.5) {
      const i = streams.findIndex((s) => s.name === name)
      if (i >= 0) streams[i] = row
      else streams.push(row)
    }
  } catch (err) {
    console.error(`${name} rel FAIL ${err.message}`)
  }
  await sleep(1100)
}

let stations = []
try {
  stations = await fetchStations()
  console.error(`stations: ${stations.length}`)
} catch (err) {
  console.error(`stations FAIL ${err.message}`)
}

writeFileSync('tmp-waterways.json', JSON.stringify({ streams, stations }), 'utf8')
console.error('wrote tmp-waterways.json')
