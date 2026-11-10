import { useEffect, useRef } from 'react'

/**
 * Ambient "magic dust": a few dozen tiny champagne/rose motes drifting upward and
 * twinkling. Fixed, non-interactive, very low opacity. Disabled for reduced motion
 * and paused when the tab is hidden.
 */
export default function MagicDust() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const count = Math.round(Math.min(70, (w * h) / 22000))
    const colors = ['243,213,143', '255,241,199', '255,156,196', '201,167,255']
    const motes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.3 + 0.3, vy: Math.random() * 0.18 + 0.05, vx: (Math.random() - 0.5) * 0.08,
      t: Math.random() * Math.PI * 2, s: Math.random() * 0.02 + 0.006,
      c: colors[Math.random() < 0.7 ? Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2)],
    }))
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const m of motes) {
        m.y -= m.vy; m.x += m.vx; m.t += m.s
        if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w }
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(m.t))
        ctx.beginPath()
        ctx.fillStyle = `rgba(${m.c},${a})`
        ctx.shadowColor = `rgba(${m.c},${a})`
        ctx.shadowBlur = m.r * 6
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
        ctx.fill()
        if (m.r > 1.3 && a > 0.7) { // occasional cross-glint on the larger motes
          ctx.strokeStyle = `rgba(${m.c},${(a - 0.6) * 1.5})`
          ctx.lineWidth = 0.5
          ctx.beginPath(); ctx.moveTo(m.x - 4, m.y); ctx.lineTo(m.x + 4, m.y); ctx.moveTo(m.x, m.y - 4); ctx.lineTo(m.x, m.y + 4); ctx.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw) }
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return <canvas ref={ref} className="magic-dust" aria-hidden="true" />
}
