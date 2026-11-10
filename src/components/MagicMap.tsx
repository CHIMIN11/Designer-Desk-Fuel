import { COUNTY_LABELS, COUNTY_PATHS, MAP_H, MAP_W, NODES } from '../lib/mapData'

/** Constellation links between district centres (illustrative network, not routes). */
const EDGES: [string, string][] = [
  ['桃園市中壢區', '桃園市八德區'], ['桃園市八德區', '桃園市桃園區'], ['桃園市桃園區', '桃園市龜山區'],
  ['桃園市大園區', '桃園市蘆竹區'], ['桃園市蘆竹區', '桃園市桃園區'], ['桃園市蘆竹區', '桃園市龜山區'],
  ['桃園市龜山區', '新北市林口區'], ['新北市林口區', '新北市新莊區'], ['新北市新莊區', '新北市三重區'],
  ['新北市三重區', '台北市中山區'], ['台北市中山區', '台北市松山區'], ['台北市松山區', '台北市信義區'],
  ['台北市松山區', '台北市內湖區'], ['台北市內湖區', '新北市汐止區'], ['新北市汐止區', '基隆市仁愛區'],
  ['新北市新莊區', '新北市板橋區'], ['新北市板橋區', '台北市萬華區'], ['台北市萬華區', '台北市大安區'],
  ['台北市大安區', '台北市信義區'], ['台北市大安區', '新北市新店區'], ['新北市淡水區', '台北市士林區'],
  ['台北市士林區', '台北市中山區'], ['桃園市龜山區', '新北市新莊區'],
]

const HOTSPOTS = ['台北市信義區', '台北市中山區', '新北市板橋區', '桃園市桃園區', '桃園市中壢區']
const PINS = ['台北市士林區', '新北市板橋區', '桃園市中壢區']

const LABELS: { key: string; zh: string; en: string; dx: number; dy: number }[] = [
  { key: '台北市', zh: '臺北市', en: '', dx: 30, dy: -40 },
  { key: '新北市', zh: '新北市', en: '', dx: -10, dy: 60 },
  { key: '桃園市', zh: '桃園市', en: '', dx: -44, dy: 42 },
  { key: '基隆市', zh: '基隆市', en: '', dx: 14, dy: -20 },
]

const STARS: [number, number, number][] = [[60, 60, 9], [500, 300, 7], [450, 40, 6], [110, 330, 6], [250, 60, 5]]

function star(x: number, y: number, r: number) {
  const k = r * 0.22
  return `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`
}

export default function MagicMap({ className = '' }: { className?: string }) {
  const [tx, ty] = NODES['台北市信義區']
  return (
    <svg className={`magic-map ${className}`} viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="魔法師地圖：臺北市、新北市、桃園市、基隆市">
      <defs>
        <radialGradient id="mmLand" cx="62%" cy="38%" r="75%">
          <stop offset="0" stopColor="#a54ad8" />
          <stop offset="0.45" stopColor="#6a2595" />
          <stop offset="1" stopColor="#2c0f45" />
        </radialGradient>
        <linearGradient id="mmGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff0c8" />
          <stop offset="1" stopColor="#c99a4e" />
        </linearGradient>
        <filter id="mmGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="mmSoft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <pattern id="mmDots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.7" fill="#f3d7ff" fillOpacity="0.28" />
        </pattern>
        <clipPath id="mmClip">
          {Object.entries(COUNTY_PATHS).map(([k, d]) => <path key={k} d={d} />)}
        </clipPath>
      </defs>

      {/* outer aura */}
      <g filter="url(#mmGlow)" opacity="0.75">
        {Object.entries(COUNTY_PATHS).map(([k, d]) => <path key={k} d={d} fill="none" stroke="#d35be0" strokeWidth="6" />)}
      </g>

      {/* land */}
      {Object.entries(COUNTY_PATHS).map(([k, d]) => (
        <path key={k} d={d} fill="url(#mmLand)" stroke="#f0b8ff" strokeOpacity="0.55" strokeWidth="0.8" strokeLinejoin="round" className={k === '台北市' ? 'mm-taipei' : undefined} />
      ))}
      <rect width={MAP_W} height={MAP_H} fill="url(#mmDots)" clipPath="url(#mmClip)" />

      {/* constellation */}
      <g stroke="#fbe7ff" strokeOpacity="0.42" strokeWidth="0.8">
        {EDGES.map(([a, b]) => {
          const [x1, y1] = NODES[a]; const [x2, y2] = NODES[b]
          return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
      </g>
      <g filter="url(#mmSoft)">
        {Object.entries(NODES).map(([k, [x, y]]) => (
          <circle key={k} cx={x} cy={y} r={HOTSPOTS.includes(k) ? 3.2 : 1.9} fill={HOTSPOTS.includes(k) ? '#ffe9b8' : '#fff'} />
        ))}
      </g>

      {/* Taipei 101 */}
      <g transform={`translate(${tx + 2} ${ty - 6})`} stroke="url(#mmGold)" strokeWidth="1.2" fill="none" strokeLinecap="round" filter="url(#mmSoft)">
        <path d="M0 -58 V-46 M-2.5 -46 H2.5 L4 -38 H-4 Z M-4 -38 L5 -30 H-5 L4 -38 M-5 -30 L6 -22 H-6 L5 -30 M-6 -22 L7 -14 H-7 L6 -22 M-7 -14 L8 -6 H-8 L7 -14 M-8 -6 H8 V0 H-8 Z" />
      </g>

      {/* pins */}
      {PINS.map((k) => {
        const [x, y] = NODES[k]
        return (
          <g key={k} transform={`translate(${x} ${y})`}>
            <circle className="mm-pulse" r="6" fill="none" stroke="#ff4fa3" strokeWidth="1.5" />
            <path d="M0 -2 C-7 -10 -8 -14 -8 -18 a8 8 0 0 1 16 0 c0 4 -1 8 -8 16 Z" fill="#ff4fa3" stroke="#fff" strokeWidth="1.2" transform="translate(0 -4)" />
            <circle cy="-22" r="2.6" fill="#fff" />
          </g>
        )
      })}

      {/* labels */}
      {LABELS.map(({ key, zh, en, dx, dy }) => {
        const [x, y] = COUNTY_LABELS[key]
        return (
          <g key={key} transform={`translate(${x + dx} ${y + dy})`} className="mm-label">
            <text className="zh">{zh}</text>
            {en && <text className="en" y="14">{en}</text>}
          </g>
        )
      })}

      {STARS.map(([x, y, r], i) => <path key={i} d={star(x, y, r)} fill="#fff6dc" className="mm-star" style={{ animationDelay: `${i * 0.7}s` }} />)}
    </svg>
  )
}
