import { CITIES, LINKS, MAP_H, MAP_W, PINS, type City } from '../lib/mapData'

/**
 * DDF Magic Map — an original "constellation magic circle" illustration.
 * Each city is a rotating magic circle holding its own constellation.
 * Purely decorative; positions are not geographic coordinates.
 */
const byKey = Object.fromEntries(CITIES.map((c) => [c.key, c])) as Record<string, City>

const DUST: [number, number, number][] = [[40, 60, 6], [520, 330, 7], [210, 40, 5], [40, 340, 5], [530, 40, 6], [228, 330, 4], [470, 210, 4]]

function sparkle(x: number, y: number, r: number) {
  const k = r * 0.22
  return `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`
}

/** Point on the edge of circle a, facing circle b. */
function edge(a: City, b: City, pad = 4): [number, number] {
  const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy)
  return [a.cx + (dx / d) * (a.r + pad), a.cy + (dy / d) * (a.r + pad)]
}

function Circle({ c, i }: { c: City; i: number }) {
  const ticks = Array.from({ length: 36 }, (_, k) => k * 10)
  const runes = Array.from({ length: 8 }, (_, k) => k * 45 + 22.5)
  return (
    <g transform={`translate(${c.cx} ${c.cy})`}>
      <circle r={c.r} fill="url(#mmCore)" />
      <circle r={c.r} fill="none" stroke="url(#mmGold)" strokeWidth="1.4" opacity="0.85" />
      <circle r={c.r - 7} fill="none" stroke="#f3d58f" strokeOpacity="0.35" strokeWidth="0.8" />
      <g className="mm-spin" style={{ animationDuration: `${60 + i * 12}s`, animationDirection: i % 2 ? 'reverse' : 'normal' }}>
        {ticks.map((a) => (
          <line key={a} x1="0" y1={-(c.r - 7)} x2="0" y2={-(c.r - (a % 30 === 0 ? 14 : 10))} stroke="#f3d58f" strokeOpacity={a % 30 === 0 ? 0.7 : 0.35} strokeWidth="0.8" transform={`rotate(${a})`} />
        ))}
        {runes.map((a) => (
          <path key={a} d="M-3 0 L0 -4 L3 0 L0 4 Z" fill="#ff7bb8" opacity="0.65" transform={`rotate(${a}) translate(0 ${-(c.r - 20)})`} />
        ))}
      </g>
      <circle r={c.r * 0.55} fill="none" stroke="#c9a7ff" strokeOpacity="0.28" strokeDasharray="2 6" />
      <polygon points={Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k - Math.PI / 2
        return `${Math.cos(a) * c.r * 0.55},${Math.sin(a) * c.r * 0.55}`
      }).join(' ')} fill="none" stroke="#c9a7ff" strokeOpacity="0.22" />
    </g>
  )
}

export default function MagicMap({ className = '' }: { className?: string }) {
  return (
    <svg className={`magic-map ${className}`} viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="DDF 魔法師地圖（示意插畫）：臺北市、新北市、桃園市、基隆市">
      <defs>
        <radialGradient id="mmCore" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#8a5bc4" stopOpacity="0.42" />
          <stop offset="0.6" stopColor="#3d2368" stopOpacity="0.32" />
          <stop offset="1" stopColor="#2c0f45" stopOpacity="0.1" />
        </radialGradient>
        <linearGradient id="mmGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c7" />
          <stop offset="0.5" stopColor="#e7c27a" />
          <stop offset="1" stopColor="#a8792e" />
        </linearGradient>
        <filter id="mmSoft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="mmGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10" /></filter>
      </defs>

      {/* aura */}
      <g filter="url(#mmGlow)" opacity="0.45">
        {CITIES.map((c) => <circle key={c.key} cx={c.cx} cy={c.cy} r={c.r * 0.9} fill="#5b3a8f" />)}
      </g>

      {/* ley lines */}
      <g stroke="#ff7bb8" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="3 5" fill="none" className="mm-flow">
        {LINKS.map(([a, b]) => {
          const [x1, y1] = edge(byKey[a], byKey[b]); const [x2, y2] = edge(byKey[b], byKey[a])
          return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
      </g>

      {CITIES.map((c, i) => <Circle key={c.key} c={c} i={i} />)}

      {/* constellations */}
      {CITIES.map((c) => (
        <g key={c.key}>
          <polyline points={[...c.stars, c.stars[0]].map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#fbe7ff" strokeOpacity="0.55" strokeWidth="0.9" />
          <line x1={c.stars[0][0]} y1={c.stars[0][1]} x2={c.stars[3 % c.stars.length][0]} y2={c.stars[3 % c.stars.length][1]} stroke="#fbe7ff" strokeOpacity="0.25" strokeWidth="0.7" />
          <g filter="url(#mmSoft)">
            {c.stars.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={k === 0 ? 3 : 2} fill={k === 0 ? '#ffe9b8' : '#fff'} />)}
          </g>
          <path d={sparkle(c.cx, c.cy, 7)} fill="url(#mmGold)" filter="url(#mmSoft)" />
        </g>
      ))}

      {/* hotspot pins */}
      {PINS.map(([key, k]) => {
        const [x, y] = byKey[key].stars[k]
        return (
          <g key={key} transform={`translate(${x} ${y})`}>
            <circle className="mm-pulse" r="6" fill="none" stroke="#ff4fa3" strokeWidth="1.5" />
            <path d="M0 -2 C-7 -10 -8 -14 -8 -18 a8 8 0 0 1 16 0 c0 4 -1 8 -8 16 Z" fill="#ff4fa3" stroke="#fff" strokeWidth="1.2" transform="translate(0 -4)" />
            <circle cy="-22" r="2.6" fill="#fff" />
          </g>
        )
      })}

      {/* labels */}
      {CITIES.map((c) => (
        <g key={c.key} transform={`translate(${c.label[0]} ${c.label[1]})`} className="mm-label" textAnchor="middle">
          <text className="zh">{c.zh}</text>
          <text className="en" y="13">{c.en}</text>
        </g>
      ))}

      {DUST.map(([x, y, r], i) => <path key={i} d={sparkle(x, y, r)} fill="#fff6dc" className="mm-star" style={{ animationDelay: `${i * 0.6}s` }} />)}
    </svg>
  )
}
