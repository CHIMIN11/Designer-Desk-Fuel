// DDF original "constellation magic circle" map. Every shape here is an original
// illustration — not derived from any government or third-party geographic data.
// Circle positions only hint at the rough relative layout of the four cities.
export const MAP_W = 560
export const MAP_H = 380

export type City = { key: string; zh: string; en: string; cx: number; cy: number; r: number; stars: [number, number][]; label: [number, number] }

export const CITIES: City[] = [
  { key: '桃園市', zh: '桃園市', en: 'TAOYUAN', cx: 140, cy: 232, r: 82, label: [140, 340],
    stars: [[96, 214], [128, 186], [170, 200], [184, 246], [146, 270], [108, 258]] },
  { key: '台北市', zh: '臺北市', en: 'TAIPEI', cx: 300, cy: 128, r: 66, label: [300, 36],
    stars: [[270, 112], [292, 92], [326, 104], [332, 138], [304, 158], [278, 146]] },
  { key: '新北市', zh: '新北市', en: 'NEW TAIPEI', cx: 372, cy: 262, r: 76, label: [372, 362],
    stars: [[330, 248], [356, 222], [398, 232], [414, 272], [384, 298], [344, 290]] },
  { key: '基隆市', zh: '基隆市', en: 'KEELUNG', cx: 470, cy: 118, r: 44, label: [470, 52],
    stars: [[452, 106], [478, 98], [490, 126], [462, 136]] },
]

/** Ley lines between circles (decorative). */
export const LINKS: [string, string][] = [['桃園市', '台北市'], ['台北市', '基隆市'], ['台北市', '新北市'], ['桃園市', '新北市'], ['新北市', '基隆市']]

/** Which star (index) of which city carries a hotspot pin. */
export const PINS: [string, number][] = [['台北市', 4], ['新北市', 1], ['桃園市', 2]]
