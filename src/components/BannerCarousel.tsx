import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'

export type Banner = { id: string; title: string; subtitle: string | null; image_url: string; link_url: string | null; link_label: string | null }

/**
 * Homepage hero carousel. Slide 0 is the brand hero (children); admin banners
 * follow. Auto-advances every 7 s, pauses on hover/focus and when the user
 * prefers reduced motion. With no banners it renders the hero alone.
 */
export default function BannerCarousel({ banners, children }: { banners: Banner[]; children: ReactNode }) {
  const total = banners.length + 1
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchX = useRef<number | null>(null)
  const reduce = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (total < 2 || paused || reduce.current) return
    const t = setInterval(() => setI((n) => (n + 1) % total), 7000)
    return () => clearInterval(t)
  }, [total, paused])

  if (total < 2) return <>{children}</>
  const go = (n: number) => setI((n + total) % total)

  return (
    <section className="bnr" aria-roledescription="carousel" aria-label="首頁 Banner"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) go(dx < 0 ? i + 1 : i - 1)
      }}>
      <div className={`bnr-slide bnr-hero${i === 0 ? ' on' : ''}`} aria-hidden={i !== 0}>{children}</div>
      {banners.map((b, k) => {
        const external = b.link_url?.startsWith('https://')
        return (
          <div key={b.id} className={`bnr-slide bnr-img${i === k + 1 ? ' on' : ''}`} aria-hidden={i !== k + 1} role="group" aria-label={`${k + 2} / ${total}`}>
            <img src={b.image_url} alt="" />
            <div className="bnr-shade" aria-hidden="true" />
            <div className="bnr-copy">
              <h2>{b.title}</h2>
              {b.subtitle && <p>{b.subtitle}</p>}
              {b.link_url && (external
                ? <a className="btn btn-magic" href={b.link_url} target="_blank" rel="noopener noreferrer" tabIndex={i === k + 1 ? 0 : -1}>{b.link_label || '了解更多'} →</a>
                : <Link className="btn btn-magic" to={b.link_url} tabIndex={i === k + 1 ? 0 : -1}>{b.link_label || '了解更多'} →</Link>)}
            </div>
          </div>
        )
      })}
      <div className="bnr-ctrl-wrap">
        <div className={`bnr-ctrl${paused || reduce.current ? ' paused' : ''}`}>
          <button type="button" className="bnr-arrow prev" aria-label="上一張" onClick={() => go(i - 1)}><Icon name="arrow" size={16} stroke={2.2} /></button>
          <span className="bnr-count" aria-live="polite"><b>{String(i + 1).padStart(2, '0')}</b><span>/ {String(total).padStart(2, '0')}</span></span>
          <div className="bnr-bars">
            {Array.from({ length: total }, (_, n) => (
              <button key={n} type="button" aria-label={`第 ${n + 1} 張`} aria-current={n === i} className={n === i ? 'on' : n < i ? 'done' : ''} onClick={() => go(n)}>
                <i key={n === i ? `on-${i}` : 'off'} />
              </button>
            ))}
          </div>
          <button type="button" className="bnr-arrow" aria-label="下一張" onClick={() => go(i + 1)}><Icon name="arrow" size={16} stroke={2.2} /></button>
        </div>
      </div>
    </section>
  )
}
