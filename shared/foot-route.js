const FOOT_UA = 'running-escape-junyeong (https://github.com/312jun/running-escape-junyeong)'

export function parsePoint(value) {
  const [lat, lng] = String(value || '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export function parseVias(value) {
  if (!value) return []
  return String(value)
    .split('|')
    .map(parsePoint)
    .filter(Boolean)
    .slice(0, 5)
}

function jsonHeaders() {
  return {
    Accept: 'application/json',
    'User-Agent': FOOT_UA,
  }
}

function decodePolyline(encoded, precision = 1e5) {
  const points = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte = 0
    do {
      byte = encoded.charCodeAt(index) - 63
      index += 1
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index) - 63
      index += 1
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push({ lat: lat / precision, lng: lng / precision })
  }

  return points
}

function asRoute(points, meters, source) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('route empty')
  const km = Number.isFinite(meters) ? meters / 1000 : 0
  return {
    points,
    km,
    durationMin: Math.max(1, Math.round(km * 6)),
    source,
  }
}

function isInSouthKorea(point) {
  return (
    point &&
    point.lat >= 33 &&
    point.lat <= 38.9 &&
    point.lng >= 124.5 &&
    point.lng <= 132
  )
}

function walkingUnsupported(data) {
  const modes = data?.available_travel_modes
  if (!Array.isArray(modes) || !modes.length) return false
  return !modes.includes('WALKING')
}

let koreaWalkSkipLogged = false

async function fetchGoogleWalk(from, to, vias, apiKey) {
  const intermediates = vias.map((p) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lng } },
  }))

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': '*',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      intermediates,
      travelMode: 'WALK',
      computeAlternativeRoutes: false,
      languageCode: 'ko',
      regionCode: 'KR',
    }),
  })

  const data = await res.json().catch(() => ({}))
  const encoded = data?.routes?.[0]?.polyline?.encodedPolyline
  if (!res.ok || !encoded) {
    throw new Error(
      data?.error?.message ||
        data?.error?.status ||
        (Array.isArray(data.routes) && data.routes.length === 0 ? 'empty routes' : null) ||
        JSON.stringify(data).slice(0, 280) ||
        `google routes http ${res.status}`,
    )
  }

  return asRoute(decodePolyline(encoded), data.routes[0].distanceMeters, 'google')
}

async function requestGoogleDirections(from, to, vias, apiKey, viaPrefix) {
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', `${from.lat},${from.lng}`)
  url.searchParams.set('destination', `${to.lat},${to.lng}`)
  url.searchParams.set('mode', 'walking')
  url.searchParams.set('language', 'ko')
  url.searchParams.set('key', apiKey)
  if (vias.length) {
    url.searchParams.set(
      'waypoints',
      vias.map((p) => `${viaPrefix ? 'via:' : ''}${p.lat},${p.lng}`).join('|'),
    )
  }

  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  const encoded = data?.routes?.[0]?.overview_polyline?.points
  if (walkingUnsupported(data)) {
    throw new Error('WALK_UNSUPPORTED modes=' + data.available_travel_modes.join(','))
  }
  if (data.status !== 'OK' || !encoded) {
    throw new Error(data.error_message || data.status || 'google directions failed')
  }

  const meters = (data.routes[0].legs || []).reduce(
    (sum, leg) => sum + (Number(leg.distance?.value) || 0),
    0,
  )
  return asRoute(decodePolyline(encoded), meters, 'google')
}

async function fetchGoogleDirections(from, to, vias, apiKey) {
  const tries = []
  if (vias.length) {
    tries.push(() => requestGoogleDirections(from, to, vias, apiKey, false))
    tries.push(() => requestGoogleDirections(from, to, vias, apiKey, true))
  }
  tries.push(() => requestGoogleDirections(from, to, [], apiKey, false))

  let lastErr = null
  for (const run of tries) {
    try {
      return await run()
    } catch (err) {
      lastErr = err
      const msg = String(err.message || '')
      if (msg.includes('WALK_UNSUPPORTED')) throw err
      if (!msg.includes('ZERO_RESULTS') && !msg.includes('NOT_FOUND')) throw err
    }
  }
  throw lastErr || new Error('google directions failed')
}

async function fetchBrouter(from, to, vias) {
  const lonlats = [from, ...vias, to].map((p) => `${p.lng},${p.lat}`).join('|')
  const url = `https://brouter.de/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=trekking&alternativeidx=0&format=geojson`
  const res = await fetch(url, { headers: jsonHeaders() })
  if (!res.ok) throw new Error(`brouter http ${res.status}`)
  const data = await res.json()
  const feature = data?.features?.[0]
  const coords = feature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) throw new Error('brouter empty')

  const points = coords.map((pair) => ({ lng: Number(pair[0]), lat: Number(pair[1]) }))
  const meters = Number(feature.properties?.['track-length'])
  return asRoute(points, meters, 'brouter')
}

async function fetchOsrm(from, to, vias, radiusM = 120) {
  const points = [from, ...vias, to]
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const radiuses = points.map(() => radiusM).join(';')
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false&generate_hints=false&radiuses=${radiuses}`
  const res = await fetch(url, { headers: jsonHeaders() })
  if (!res.ok) throw new Error(`osrm http ${res.status}`)
  const data = await res.json()
  const geometry = data?.routes?.[0]?.geometry?.coordinates
  if (!Array.isArray(geometry) || geometry.length < 2) throw new Error('osrm empty')
  const routePoints = geometry.map(([lng, lat]) => ({ lat, lng }))
  return asRoute(routePoints, data.routes[0].distance, 'osrm')
}

/** 구글 도보가 되면 그걸 쓰고, 한국처럼 도보 API가 막힌 곳은 BRouter/OSRM. */
export async function fetchWalkingRoute(from, to, vias = [], { googleKey, preferOsrm } = {}) {
  const errors = []
  const korea = isInSouthKorea(from) && isInSouthKorea(to)

  if (preferOsrm) {
    try {
      return await fetchOsrm(from, to, vias, 220)
    } catch (err) {
      errors.push(`osrm: ${err.message}`)
    }
    try {
      return await fetchBrouter(from, to, vias)
    } catch (err) {
      errors.push(`brouter: ${err.message}`)
      throw new Error(errors.join(' | '))
    }
  }

  if (googleKey && !korea) {
    try {
      return await fetchGoogleDirections(from, to, vias, googleKey)
    } catch (err) {
      console.warn('[foot-route] Directions API 실패:', err.message)
      errors.push(`directions: ${err.message}`)
    }
    try {
      return await fetchGoogleWalk(from, to, vias, googleKey)
    } catch (err) {
      console.warn('[foot-route] Routes API 실패:', err.message)
      errors.push(`routes: ${err.message}`)
    }
  } else if (googleKey && korea && !koreaWalkSkipLogged) {
    koreaWalkSkipLogged = true
    console.info('[foot-route] 한국은 Google 도보 API가 없어 한강 공원길 엔진을 씁니다')
  }

  try {
    return await fetchBrouter(from, to, vias)
  } catch (err) {
    errors.push(`brouter: ${err.message}`)
  }

  try {
    return await fetchOsrm(from, to, vias)
  } catch (err) {
    errors.push(`osrm: ${err.message}`)
    throw new Error(errors.join(' | '))
  }
}
