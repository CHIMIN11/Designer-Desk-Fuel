/**
 * DEMO content for the homepage layout only (not real businesses or real reviews).
 * Shown only when there is no real data yet AND VITE_SHOW_DEMO is 'true'.
 * Set VITE_SHOW_DEMO=false in .env.production before the official launch.
 */
export const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO === 'true'

export const DEMO_SPACES = [
  { name: '曬光咖啡', en: 'Daylight Café', area: '台北 · 大安區', min: 150, rating: 4.9, count: 128, img: '/demo/demo-daylight.jpg' },
  { name: '紙上工作室', en: 'Paper Work', area: '台北 · 中山區', min: 120, rating: 4.8, count: 96, img: '/demo/demo-paperwork.jpg' },
  { name: '森域咖啡', en: 'Forest Area', area: '桃園 · 桃園區', min: 130, rating: 4.7, count: 73, img: '/demo/demo-forest.jpg' },
  { name: '角落實驗室', en: 'Corner Lab', area: '桃園 · 中壢區', min: 150, rating: 4.8, count: 61, img: '/demo/demo-cornerlab.jpg' },
]

export const DEMO_REVIEWS = [
  { name: 'Kimi', role: 'UI / UX 設計師', stars: 4.5, text: '座位寬敞、插座充足，可以很專心完成設計提案！', img: '/demo/demo-reviewer-kimi.jpg' },
  { name: 'Eason', role: '工業設計師', stars: 5, text: '不限時又有好網速，是我常駐的靈感基地。', img: '/demo/demo-reviewer-eason.jpg' },
  { name: 'Miko', role: '平面設計師', stars: 4.5, text: '空間美、採光好，也適合小型設計師聚會！', img: '/demo/demo-reviewer-miko.jpg' },
]
