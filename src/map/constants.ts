import { geoGraticule10 } from 'd3-geo';

export const SPHERE = { type: 'Sphere' } as const;
export const GRATICULE = geoGraticule10();
export const DATA_URLS = ['/world-l.topo.json', '/world-m.topo.json', '/world-h.topo.json'];
export const HIGH_DETAIL_ZOOM = 3;
export const MAX_ZOOM = 60;
export const LABEL_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const WATER_LABELS: [string, number, number, 0 | 1 | 2][] = [
  ['North Pacific Ocean', -155, 30, 0],
  ['South Pacific Ocean', -125, -32, 0],
  ['North Atlantic Ocean', -40, 34, 0],
  ['South Atlantic Ocean', -16, -32, 0],
  ['Indian Ocean', 80, -28, 0],
  ['Arctic Ocean', -35, 79, 0],
  ['Southern Ocean', 5, -62, 0],
  ['Mediterranean Sea', 17, 35.5, 1],
  ['Caribbean Sea', -75.5, 15, 1],
  ['South China Sea', 114, 13, 1],
  ['Sea of Japan', 134.5, 40, 1],
  ['Bering Sea', -176, 57, 1],
  ['Gulf of Mexico', -90.5, 25, 1],
  ['Hudson Bay', -85, 59.5, 1],
  ['North Sea', 3, 56.5, 1],
  ['Black Sea', 34, 43.5, 1],
  ['Caspian Sea', 50.5, 41.5, 1],
  ['Red Sea', 38, 20.5, 1],
  ['Arabian Sea', 64, 14, 1],
  ['Bay of Bengal', 88, 13, 1],
  ['Coral Sea', 155, -16, 1],
  ['Tasman Sea', 160, -37, 1],
  ['Sea of Okhotsk', 149, 53, 1],
  ['Philippine Sea', 132, 17, 1],
  ['Labrador Sea', -55, 58, 1],
  ['Norwegian Sea', 2, 68, 1],
  ['Barents Sea', 40, 73.5, 1],
  ['Greenland Sea', -8, 75.5, 1],
  ['Gulf of Guinea', 2, 0.5, 1],
  ['Gulf of Alaska', -145, 57, 1],
  ['Weddell Sea', -45, -71, 1],
  ['Ross Sea', -178, -74, 1],
  ['Baltic Sea', 19.5, 58, 2],
  ['East China Sea', 125, 29, 2],
  ['Persian Gulf', 51, 27, 2],
  ['Mozambique Channel', 41, -18, 2],
  ['Andaman Sea', 96, 10, 2],
  ['Java Sea', 111, -5, 2],
  ['Banda Sea', 127, -5.5, 2],
  ['Kara Sea', 70, 74.5, 2],
  ['Laptev Sea', 125, 76, 2],
  ['East Siberian Sea', 158, 73, 2],
  ['Beaufort Sea', -140, 72, 2],
  ['Baffin Bay', -72, 73, 2],
  ['Bay of Biscay', -4.5, 45.5, 2],
  ['Adriatic Sea', 15.5, 42.8, 2],
  ['Gulf of Aden', 47.5, 12.5, 2],
  ['Gulf of Oman', 58.5, 24.5, 2],
  ['Yellow Sea', 123, 36, 2],
  ['Celebes Sea', 122, 3.5, 2],
  ['Arafura Sea', 135, -9.5, 2],
  ['Bay of Bothnia', 20.5, 62.5, 2],
  ['Scotia Sea', -45, -57, 2],
  ['Chukchi Sea', -170, 70, 2],
];

export const WATER_TIER_MIN_K = [1, 1.7, 3.2];
