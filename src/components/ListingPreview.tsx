import { useEffect, useMemo, useState } from 'react'
import { CATEGORY, POWER, PRICE } from '../lib/labels'

type Draft = Record<string, string>

const yn = (v: string, yes: string, no: string) => (v === 'yes' ? yes : v === 'no' ? no : '—')

/** Live preview of how a listing will appear in 探索空間 once approved. */
export default function ListingPreview({ f, photos, logo }: { f: Draft; photos: File[]; logo: File[] }) {
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos])
  const logoUrl = useMemo(() => (logo[0] ? URL.createObjectURL(logo[0]) : ''), [logo])
  useEffect(() => () => { urls.forEach((u) => URL.revokeObjectURL(u)); if (logoUrl) URL.revokeObjectURL(logoUrl) }, [urls, logoUrl])
  const [active, setActive] = useState(0)
  const shown = urls[Math.min(active, Math.max(urls.length - 1, 0))]

  const facts: [string, string][] = [
    ['營業時間', f.opening_hours || '—'],
    ['價格區間', f.price_range ? PRICE[f.price_range] : '—'],
    ['低消', f.minimum_charge === '' || f.minimum_charge === undefined ? '—' : f.minimum_charge === '0' ? '無低消' : `NT$${f.minimum_charge}`],
    ['Wi‑Fi', yn(f.wifi_available, '有', '無')],
    ['插座', f.power_outlets ? POWER[f.power_outlets] : '—'],
    ['用餐時限', yn(f.no_time_limit, '不限時', '有時限')],
    ['洗手間', yn(f.has_restroom, '有', '無')],
    ['大桌面', yn(f.large_tables, '有', '無')],
    ['設計師聚會', yn(f.group_friendly, '可接待團體', '不接待團體')],
    ['活動／講座', f.supports_events === 'yes' ? `可租借${f.event_capacity ? `，約 ${f.event_capacity} 人` : ''}` : yn(f.supports_events, '可租借', '不提供')],
  ]

  return (
    <div className="lp">
      <p className="lp-kicker">刊登示意 · Preview</p>
      <article className="lp-card">
        <div className="lp-photo">
          {shown ? <img src={shown} alt="店家照片預覽" /> : <span>上傳店家照片後顯示</span>}
          {logoUrl && <img className="lp-logo" src={logoUrl} alt="Logo 預覽" />}
          <span className="lp-badge">審核通過後公開</span>
        </div>
        {urls.length > 1 && (
          <div className="lp-thumbs">
            {urls.map((u, i) => (
              <button key={u} type="button" aria-label={`第 ${i + 1} 張`} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
                <img src={u} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="lp-body">
          <h3>{f.business_name || '店家名稱'}</h3>
          <p className="lp-meta">{CATEGORY[f.category] ?? '空間類別'} · {f.city}{f.district ? ` · ${f.district}` : ''}</p>
          {f.address && <p className="lp-addr">{f.address}</p>}
          <dl className="facts lp-facts">
            {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={v === '—' ? 'lp-empty' : ''}>{v}</dd></div>)}
            <div style={{ gridColumn: '1 / -1' }}><dt>座位與場地資訊</dt><dd className={f.seating_information ? '' : 'lp-empty'}>{f.seating_information || '—'}</dd></div>
          </dl>
          <p className="lp-links">
            {f.official_website ? <span>官方網站 ↗</span> : null}
            {f.official_social_url ? <span>官方社群 ↗</span> : null}
          </p>
          <p className="lp-foot">Last Verified Date：審核後顯示</p>
        </div>
      </article>
      <p className="lp-note">此為公開頁面的示意。未填寫的項目會顯示「—」；聯絡人與 Email 不會公開。</p>
    </div>
  )
}
