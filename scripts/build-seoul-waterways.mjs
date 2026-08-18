/** Build Seoul-only stream tracks + subway stops from tmp-waterways.json. */
import { readFileSync, writeFileSync } from 'fs'
import { HANGANG_STOPS } from '../src/data/hangangStops.js'

const UA = 'running-escape-junyeong (https://github.com/312jun/running-escape-junyeong)'

/** 서울 25개 구 대략 경계. 경기(의정부·성남·안양·광명·하남)는 제외. */
const SEOUL = {
  minLat: 37.428,
  maxLat: 37.701,
  minLng: 126.764,
  maxLng: 127.184,
}

const LINE_MAP = {
  공항철도: '공항',
  경의선: '경의중앙',
  경의중앙선: '경의중앙',
  중앙선: '경의중앙',
  분당선: '수인분당',
  수인선: '수인분당',
  수인분당선: '수인분당',
  신분당선: '신분당',
  경춘선: '경춘',
  우이신설선: '우이신설',
  우이신설경전철: '우이신설',
}

function inSeoul(p) {
  return p.lat >= SEOUL.minLat && p.lat <= SEOUL.maxLat && p.lng >= SEOUL.minLng && p.lng <= SEOUL.maxLng
}

function roundPt(p) {
  return { lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 }
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

function downsample(points, minKm = 0.16) {
  if (!points?.length) return []
  const out = [points[0]]
  for (const p of points.slice(1)) {
    if (haversineKm(out[out.length - 1], p) >= minKm) out.push(p)
  }
  const last = points[points.length - 1]
  if (haversineKm(out[out.length - 1], last) > 0.05) out.push(last)
  return out.map(roundPt)
}

function clipTrack(points) {
  const kept = []
  for (const p of points) {
    if (inSeoul(p)) kept.push(p)
    else if (kept.length && pathLen(kept) >= 1.2) break
  }
  return downsample(kept, 0.16)
}

function coordsToPoints(coords) {
  if (!Array.isArray(coords) || !coords.length) return []
  if (typeof coords[0][0] === 'number') return coords.map(([lng, lat]) => ({ lat, lng }))
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

async function lookupRelation(osmId, name) {
  const url = new URL('https://nominatim.openstreetmap.org/lookup')
  url.searchParams.set('osm_ids', `R${osmId}`)
  url.searchParams.set('format', 'geojson')
  url.searchParams.set('polygon_geojson', '1')
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${name} lookup ${res.status}`)
  const data = await res.json()
  const segs = []
  for (const f of data.features || []) {
    const pts = (coordsToPoints(f.geometry?.coordinates) || []).filter(inSeoul)
    if (pts.length >= 2) segs.push(pts)
  }
  const raw = orientWestToEast(stitch(segs))
  return { name, points: downsample(raw, 0.16), km: Number(pathLen(raw).toFixed(2)) }
}

function slug(name) {
  const map = {
    청계천: 'cheonggyecheon',
    중랑천: 'jungnangcheon',
    안양천: 'anyangcheon',
    탄천: 'tancheon',
    양재천: 'yangjaecheon',
    홍제천: 'hongjecheon',
    성내천: 'seongnaecheon',
    도림천: 'dorimcheon',
    불광천: 'bulgwangcheon',
    우이천: 'uicheon',
    반포천: 'banpocheon',
    고덕천: 'godeokcheon',
    당현천: 'danghyeoncheon',
    목감천: 'mokgamcheon',
  }
  return map[name] || name
}

function normalizeLines(raw) {
  const out = []
  for (const item of raw || []) {
    let s = String(item).replace(/\s+/g, '')
    if (!s || s === '지하철' || s.includes('서울지하철') || s.includes('서울특별시')) continue
    s = s.replace(/호선/g, '')
    if (LINE_MAP[s]) s = LINE_MAP[s]
    if (/^[1-9]$/.test(s)) {
      out.push(s)
      continue
    }
    if (/^A\d/i.test(s)) {
      out.push('공항')
      continue
    }
    if (/^K1/i.test(s)) {
      out.push('경의중앙')
      continue
    }
    if (/^K2|^K4|^K5/i.test(s)) {
      out.push('수인분당')
      continue
    }
    if (/^K2|^P1/i.test(s)) {
      out.push('경춘')
      continue
    }
    if (s === 'D1' || s.includes('우이')) {
      out.push('우이신설')
      continue
    }
    if (s.includes('신분당') || s === 'S') {
      out.push('신분당')
      continue
    }
    if (s.includes('경의') || s.includes('중앙')) out.push('경의중앙')
    else if (s.includes('분당') || s.includes('수인')) out.push('수인분당')
    else if (s.includes('공항')) out.push('공항')
    else if (s.includes('경춘')) out.push('경춘')
    else if (/^\d{2,4}$/.test(s)) continue
    else if (s.length <= 6) out.push(s)
  }
  return [...new Set(out)].slice(0, 4)
}

const extraLines = {
  광화문: ['5'],
  종각: ['1'],
  종로3가: ['1', '3', '5'],
  을지로입구: ['2'],
  을지로3가: ['2', '3'],
  을지로4가: ['2', '5'],
  동대문: ['1', '4'],
  동대문역사문화공원: ['2', '4', '5'],
  신당: ['2', '6'],
  동묘앞: ['1', '6'],
  신설동: ['1', '2', '우이신설'],
  용두: ['2'],
  신답: ['2'],
  용답: ['2'],
  청량리: ['1', '경의중앙', '경춘', '수인분당'],
  제기동: ['1'],
  답십리: ['5'],
  장한평: ['5'],
  군자: ['5', '7'],
  중곡: ['7'],
  면목: ['7'],
  상봉: ['7', '경의중앙', '경춘'],
  중화: ['7'],
  먹골: ['7'],
  태릉입구: ['6', '7'],
  공릉: ['7'],
  하계: ['7'],
  중계: ['7'],
  노원: ['4', '7'],
  창동: ['1', '4'],
  쌍문: ['4'],
  수유: ['4'],
  미아: ['4'],
  한성대입구: ['4'],
  성신여대입구: ['4', '우이신설'],
  보문: ['6', '우이신설'],
  안국: ['3'],
  경복궁: ['3'],
  독립문: ['3'],
  무악재: ['3'],
  홍제: ['3'],
  녹번: ['3'],
  불광: ['3', '6'],
  연신내: ['3', '6'],
  구산: ['6'],
  응암: ['6'],
  새절: ['6'],
  증산: ['6'],
  디지털미디어시티: ['6', '경의중앙', '공항'],
  월드컵경기장: ['6'],
  마포구청: ['6'],
  광흥창: ['6'],
  대흥: ['6'],
  공덕: ['5', '6', '경의중앙', '공항'],
  애오개: ['5'],
  충정로: ['2', '5'],
  서대문: ['5'],
  청구: ['5', '6'],
  신금호: ['5'],
  행당: ['5'],
  왕십리: ['2', '5', '경의중앙', '수인분당'],
  마장: ['5'],
  신길: ['1', '5'],
  여의도: ['5', '9'],
  여의나루: ['5'],
  마포: ['경의중앙'],
  합정: ['2', '6'],
  당산: ['2', '9'],
  영등포구청: ['2', '5'],
  문래: ['2'],
  신도림: ['1', '2'],
  도림천: ['2'],
  대림: ['2', '7'],
  구로디지털단지: ['2'],
  신대방: ['2'],
  신풍: ['7'],
  보라매: ['7'],
  신대방삼거리: ['7'],
  장승배기: ['7'],
  상도: ['7'],
  숭실대입구: ['7'],
  남성: ['7'],
  총신대입구: ['4', '7'],
  내방: ['7'],
  고속터미널: ['3', '7', '9'],
  반포: ['7'],
  논현: ['7'],
  학동: ['7'],
  강남구청: ['7', '수인분당'],
  청담: ['7'],
  뚝섬유원지: ['7'],
  건대입구: ['2', '7'],
  어린이대공원: ['7'],
  용마산: ['7'],
  사가정: ['7'],
  온수: ['1', '7'],
  천왕: ['7'],
  광명사거리: ['7'],
  가산디지털단지: ['1', '7'],
  남구로: ['7'],
  대청: ['3'],
  학여울: ['3'],
  대치: ['3'],
  도곡: ['3', '수인분당'],
  매봉: ['3'],
  양재: ['3', '신분당'],
  남부터미널: ['3'],
  교대: ['2', '3'],
  잠원: ['3'],
  신사: ['3', '신분당'],
  압구정: ['3'],
  옥수: ['3', '경의중앙'],
  금호: ['3'],
  약수: ['3', '6'],
  동대입구: ['3'],
  충무로: ['3', '4'],
  명동: ['4'],
  회현: ['4'],
  서울: ['1', '4', '공항', '경의중앙'],
  숙대입구: ['4'],
  삼각지: ['4', '6'],
  신용산: ['4'],
  이촌: ['4', '경의중앙'],
  동작: ['4', '9'],
  이수: ['4', '7'],
  사당: ['2', '4'],
  낙성대: ['2'],
  서울대입구: ['2'],
  봉천: ['2'],
  신림: ['2'],
  신정네거리: ['2'],
  양천구청: ['2'],
  오목교: ['5'],
  목동: ['5'],
  신정: ['5'],
  까치산: ['2', '5'],
  화곡: ['5'],
  우장산: ['5'],
  발산: ['5'],
  마곡: ['5'],
  송정: ['5'],
  김포공항: ['5', '9', '공항'],
  개화산: ['5'],
  방화: ['5'],
  양평: ['5'],
  영등포시장: ['5'],
  영등포: ['1'],
  신길온천: ['4', '수인분당'],
  수서: ['3', '수인분당'],
  가락시장: ['3', '8'],
  문정: ['8'],
  장지: ['8'],
  복정: ['8', '수인분당'],
  산성: ['8'],
  남한산성입구: ['8'],
  단대오거리: ['8'],
  신흥: ['8'],
  수진: ['8'],
  모란: ['8', '수인분당'],
  몽촌토성: ['8'],
  강동: ['5', '8'],
  천호: ['5', '8'],
  암사: ['8'],
  강동구청: ['8'],
  둔촌동: ['5'],
  올림픽공원: ['5', '9'],
  방이: ['5'],
  오금: ['3', '5'],
  개롱: ['5'],
  거여: ['5'],
  마천: ['5'],
  길동: ['5'],
  굽은다리: ['5'],
  명일: ['5'],
  고덕: ['5'],
  상일동: ['5'],
  강일: ['5'],
  미사: ['5'],
  하남풍산: ['5'],
  하남시청: ['5'],
  하남검단산: ['5'],
  한강진: ['6'],
  버티고개: ['6'],
  창신: ['6'],
  고려대: ['6'],
  월곡: ['6'],
  상월곡: ['6'],
  돌곶이: ['6'],
  석계: ['1', '6'],
  태릉: ['6'],
  화랑대: ['6'],
  봉화산: ['6'],
  신내: ['6', '경춘'],
  중랑: ['경의중앙', '경춘'],
  회기: ['1', '경의중앙', '경춘'],
  외대앞: ['1'],
  신이문: ['1'],
  광운대: ['1', '경춘'],
  월계: ['1'],
  녹천: ['1'],
  방학: ['1'],
  도봉: ['1'],
  도봉산: ['1', '7'],
  망월사: ['1'],
  한남: ['경의중앙'],
  서빙고: ['경의중앙'],
  용산: ['1', '경의중앙'],
  효창공원앞: ['경의중앙', '6'],
  서강대: ['경의중앙'],
  홍대입구: ['2', '경의중앙', '공항'],
  가좌: ['경의중앙'],
  수색: ['경의중앙'],
  화전: ['경의중앙'],
  강서: ['5'],
  개화: ['9'],
  공항시장: ['9'],
  신방화: ['9'],
  마곡나루: ['9', '공항'],
  양천향교: ['9'],
  가양: ['9'],
  증미: ['9'],
  등촌: ['9'],
  염창: ['9'],
  신목동: ['9'],
  선유도: ['9'],
  국회의사당: ['9'],
  샛강: ['9'],
  노량진: ['1', '9'],
  노들: ['9'],
  흑석: ['9'],
  구반포: ['9'],
  신반포: ['9'],
  사평: ['9'],
  신논현: ['9', '신분당'],
  언주: ['9'],
  선정릉: ['9', '수인분당'],
  삼성중앙: ['9'],
  봉은사: ['9'],
  종합운동장: ['2', '9'],
  삼전: ['9'],
  석촌고분: ['9'],
  석촌: ['8', '9'],
  송파나루: ['9'],
  한성백제: ['9'],
  둔촌오륜: ['9'],
  중앙보훈병원: ['9'],
  선릉: ['2', '수인분당'],
  한티: ['수인분당'],
  구룡: ['수인분당'],
  개포동: ['수인분당'],
  대모산입구: ['수인분당'],
  서울숲: ['수인분당'],
  압구정로데오: ['수인분당'],
  강남: ['2', '신분당'],
  양재시민의숲: ['신분당'],
  청계산입구: ['신분당'],
  판교: ['신분당', '경강'],
  정자: ['수인분당', '신분당'],
  미금: ['수인분당', '신분당'],
  동천: ['신분당'],
  수지구청: ['신분당'],
  성복: ['신분당'],
  상현: ['신분당'],
  광교중앙: ['신분당'],
  광교: ['신분당'],
  뚝섬: ['2'],
  한양대: ['2'],
  상왕십리: ['2'],
  신정교: ['2'],
  잠실나루: ['2'],
  잠실: ['2', '8'],
  잠실새내: ['2'],
  삼성: ['2'],
  역삼: ['2'],
  서초: ['2'],
  방배: ['2'],
  낙성대입구: ['2'],
  구로: ['1'],
  개봉: ['1'],
  오류동: ['1'],
  역곡: ['1'],
  소사: ['1'],
  부천: ['1'],
  중동: ['1'],
  송내: ['1'],
  부개: ['1'],
  부평: ['1'],
  백운: ['1'],
  동암: ['1'],
  주안: ['1'],
  도화: ['1'],
  제물포: ['1'],
  도원: ['1'],
  동인천: ['1'],
  인천: ['1'],
  남영: ['1'],
  지하서울: ['1'],
  시청: ['1', '2'],
  종로5가: ['1'],
  동대문역: ['1'],
  신설: ['1'],
  남영역: ['1'],
  대방: ['1'],
  신길역: ['1'],
  영등포역: ['1'],
  신도림역: ['1'],
  구일: ['1'],
  개봉역: ['1'],
  오류동역: ['1'],
  서동탄: ['1'],
  성환: ['1'],
  직산: ['1'],
  두정: ['1'],
  천안: ['1'],
  봉명: ['1'],
  쌍용: ['1'],
  아산: ['1'],
  탕정: ['1'],
  배방: ['1'],
  온양온천: ['1'],
  신창: ['1'],
  북한산우이: ['우이신설'],
  솔밭공원: ['우이신설'],
  '4.19민주묘지': ['우이신설'],
  가오리: ['우이신설'],
  화계: ['우이신설'],
  삼양: ['우이신설'],
  삼양사거리: ['우이신설'],
  솔샘: ['우이신설'],
  북한산보국문: ['우이신설'],
  정릉: ['우이신설'],
}

function dumpArray(items) {
  return JSON.stringify(items, null, 2)
    .replace(/"lat": /g, 'lat: ')
    .replace(/"lng": /g, 'lng: ')
    .replace(/"name": /g, 'name: ')
    .replace(/"id": /g, 'id: ')
    .replace(/"track": /g, 'track: ')
    .replace(/"type": /g, 'type: ')
    .replace(/"lines": /g, 'lines: ')
    .replace(/"side": /g, 'side: ')
}

const raw = JSON.parse(readFileSync('tmp-waterways.json', 'utf8').replace(/^\uFEFF/, ''))

const extras = []
try {
  extras.push(await lookupRelation(19282613, '안양천'))
} catch (err) {
  console.error('안양천', err.message)
}
await new Promise((r) => setTimeout(r, 1100))
try {
  extras.push(await lookupRelation(19279176, '탄천'))
} catch (err) {
  console.error('탄천', err.message)
}

const byName = new Map()
for (const row of [...raw.streams, ...extras]) {
  if (!row?.points?.length) continue
  const track = clipTrack(orientWestToEast(row.points))
  const km = pathLen(track)
  if (track.length < 8 || km < 1.5) {
    console.error(`skip ${row.name}: ${track.length}pts ${km.toFixed(2)}km`)
    continue
  }
  byName.set(row.name, { id: slug(row.name), name: row.name, track })
  console.error(`ok ${row.name}: ${track.length}pts ${km.toFixed(1)}km`)
}

const streams = [...byName.values()]

const hangangLines = new Map(HANGANG_STOPS.map((s) => [s.name, s.lines]))

const OUTSIDE_SEOUL = /광명|부천|역곡|소사|인천|부평|주안|송내|의정부|회룡|망월사|하남|미사|모란|야탑|이매|서현|수내|정자|미금|오리|죽전|분당|판교|과천|평촌|범계|산본|금정|광교|수지|성남|김포시|고잔|초지|안산|오이도|달월|월곶|소래포구|인천논현|호구포|남동인더스파크|원인재|연수|송도/

const stations = []
const seen = new Set()
for (const st of raw.stations || []) {
  if (!inSeoul(st)) continue
  const name = String(st.name || '').replace(/\s+/g, '')
  if (!name || seen.has(name)) continue
  if (OUTSIDE_SEOUL.test(name)) continue
  if (name.includes('입구') && name.length > 6) continue
  seen.add(name)
  const lines = extraLines[name] || hangangLines.get(name) || normalizeLines(st.lines)
  stations.push({
    name,
    type: 'subway',
    lines: lines.length ? lines : ['지하철'],
    lat: roundPt(st).lat,
    lng: roundPt(st).lng,
  })
}

writeFileSync(
  'src/data/streams.js',
  `/** 서울 안 하천·강 도보 기준 트랙. 한강은 hangang.js, 경기 구간은 잘라냈다. */\nexport const SEOUL_STREAMS = ${dumpArray(streams)}\n`,
  'utf8',
)

writeFileSync(
  'src/data/subwayStops.js',
  `/** 서울 안 지하철역. 하천 코스 탈출점 스냅용. */\nexport const SEOUL_SUBWAY_STOPS = ${dumpArray(stations)}\n`,
  'utf8',
)

console.error(`wrote ${streams.length} streams, ${stations.length} stations`)
