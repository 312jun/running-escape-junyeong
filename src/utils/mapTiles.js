/** 구글 로드맵. 막히면 아래 OSM이 비쳐 보인다. */
export const GOOGLE_TILES = {
  url: 'https://mt{s}.google.com/vt/lyrs=m&hl=ko&x={x}&y={y}&z={z}',
  options: {
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '&copy; Google',
  },
}

export const OSM_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  },
}
