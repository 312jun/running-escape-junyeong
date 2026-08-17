import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GOOGLE_TILES, OSM_TILES } from './mapTiles'

const CLEAR_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

function addBaseTiles(map) {
  L.tileLayer(OSM_TILES.url, OSM_TILES.options).addTo(map)
  L.tileLayer(GOOGLE_TILES.url, {
    ...GOOGLE_TILES.options,
    errorTileUrl: CLEAR_TILE,
  }).addTo(map)
}

function resetLeafletEl(el) {
  if (!el) return
  if (el._leaflet_id) {
    el._leaflet_id = undefined
  }
  el.innerHTML = ''
  el.className = el.className
    .split(/\s+/)
    .filter((name) => name && !name.startsWith('leaflet-'))
    .join(' ')
}

function createLeafletEngine(el, center, zoom) {
  resetLeafletEl(el)

  const map = L.map(el, {
    zoomControl: true,
    attributionControl: true,
  }).setView([center.lat, center.lng], zoom)

  addBaseTiles(map)
  requestAnimationFrame(() => map.invalidateSize())

  return {
    engine: 'leaflet',
    panTo(point) {
      map.panTo([point.lat, point.lng], { animate: true, duration: 0.4 })
    },
    fit(points) {
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.lat, p.lng])).pad(0.28),
      )
    },
    resize() {
      map.invalidateSize()
    },
    onClick(handler) {
      const onClick = (e) => handler({ lat: e.latlng.lat, lng: e.latlng.lng })
      map.on('click', onClick)
      return () => map.off('click', onClick)
    },
    marker({ position, html, anchor = [0, 0], zIndex = 100 }) {
      const marker = L.marker([position.lat, position.lng], {
        icon: L.divIcon({
          className: '',
          html,
          iconAnchor: anchor,
        }),
        zIndexOffset: zIndex,
      }).addTo(map)
      return {
        setLatLng(point) {
          marker.setLatLng([point.lat, point.lng])
        },
        getElement() {
          return marker.getElement()
        },
        setVisible(on) {
          if (on) marker.addTo(map)
          else marker.remove()
        },
        remove() {
          marker.remove()
        },
      }
    },
    polyline({ path, color, weight, opacity, className }) {
      const line = L.polyline(
        path.map((p) => [p.lat, p.lng]),
        { color, weight, opacity, lineCap: 'round', lineJoin: 'round', className },
      ).addTo(map)
      return {
        setPath(next) {
          line.setLatLngs(next.map((p) => [p.lat, p.lng]))
        },
        remove() {
          line.remove()
        },
      }
    },
    circle({ center: c, radius, color, weight, fillColor, fillOpacity, opacity }) {
      const shape = L.circle([c.lat, c.lng], {
        radius,
        color,
        weight,
        fillColor,
        fillOpacity,
        opacity,
      })
      return {
        setLatLng(point) {
          shape.setLatLng([point.lat, point.lng])
        },
        setRadius(next) {
          shape.setRadius(next)
        },
        setVisible(on) {
          if (on) shape.addTo(map)
          else shape.remove()
        },
        remove() {
          shape.remove()
        },
      }
    },
    destroy() {
      map.remove()
      resetLeafletEl(el)
    },
  }
}

export function createMap(el, { center, zoom = 15 } = {}) {
  if (!el) throw new Error('map container missing')
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error('map center missing')
  }
  return createLeafletEngine(el, center, Math.max(14, zoom))
}
