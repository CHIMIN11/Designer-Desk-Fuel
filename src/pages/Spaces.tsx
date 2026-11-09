import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CATEGORY, CITIES, POWER, PRICE, formatDate } from '../lib/labels'
import { errorText, supabase } from '../lib/supabase'
import SpaceReviews from '../components/SpaceReviews'

export type PublicSpace = {
  id: string
  business_name: string
  address: string
  city: string
  district: string | null
  category: string
  price_range: string | null
  opening_hours: string | null
  wifi_available: boolean | null
  power_outlets: string | null
  seating_information: string | null
  large_tables: boolean | null
  supports_events: boolean | null
  event_capacity: number | null
  group_friendly: boolean | null
  official_website: string | null
  official_social_url: string | null
  last_verified_at: string | null
  data_stale: boolean
}

const yesNo = (v: boolean | null) => (v == null ? '—' : v ? '有' : '無')

export default function Spaces() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<PublicSpace[] | null>(null)
  const [error, setError] = useState('')

  const city = params.get('city') ?? ''
  const category = params.get('category') ?? ''
  const price = params.get('price') ?? ''
  const wifi = params.get('wifi') === '1'
  const power = params.get('power') === '1'
  const tables = params.get('tables') === '1'
  const events = params.get('events') === '1'
  const group = params.get('group') === '1'

  useEffect(() => {
    if (!supabase) return
    setRows(null)
    setError('')
    supabase
      .rpc('list_public_spaces', {
        p_city: city || null,
        p_category: category || null,
        p_price_range: price || null,
        p_wifi: wifi ? true : null,
        p_power: power ? true : null,
        p_large_tables: tables ? true : null,
        p_events: events ? true : null,
        p_group: group ? true : null,
      })
      .then(({ data, error }) => {
        if (error) setError(errorText(error))
        else setRows((data ?? []) as PublicSpace[])
      })
  }, [city, category, price, wifi, power, tables, events, group])

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return (
    <div className="container page">
      <h1>探索空間</h1>
      <p className="lead">
        Workspace Directory：這裡只列出取得店家授權、並經 DDF 核對資料後公開的工作空間。資訊由店家提供，不代表推薦、認證或品質保證。
      </p>

      <div className="filters">
        <label className="field">地區
          <select value={city} onChange={(e) => set('city', e.target.value)}>
            <option value="">全部地區</option>
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">空間類別
          <select value={category} onChange={(e) => set('category', e.target.value)}>
            <option value="">全部類別</option>
            {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">價格區間
          <select value={price} onChange={(e) => set('price', e.target.value)}>
            <option value="">不限價格</option>
            {Object.entries(PRICE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="chips" role="group" aria-label="設備">
          <button type="button" className="chip chip-dark" aria-pressed={wifi} onClick={() => set('wifi', wifi ? '' : '1')}>Wi‑Fi</button>
          <button type="button" className="chip chip-dark" aria-pressed={power} onClick={() => set('power', power ? '' : '1')}>插座</button>
          <button type="button" className="chip chip-dark" aria-pressed={tables} onClick={() => set('tables', tables ? '' : '1')}>大桌面</button>
          <button type="button" className="chip chip-dark" aria-pressed={events} onClick={() => set('events', events ? '' : '1')}>可辦活動／講座</button>
          <button type="button" className="chip chip-dark" aria-pressed={group} onClick={() => set('group', group ? '' : '1')}>可接待聚會</button>
        </div>
      </div>

      {!supabase && <p className="notice notice-warn">尚未連接 Supabase，目錄暫時無法載入。設定方式請見 README。</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {supabase && rows === null && !error && <p className="notice notice-info">載入中…</p>}
      {rows && rows.length === 0 && (
        <div className="card">
          <p style={{ margin: 0, lineHeight: 1.8 }}>
            目前沒有符合條件、已授權公開的空間。DDF 只刊登經店家授權的資訊，名單會隨店家加入逐步增加。
          </p>
          <p style={{ margin: '12px 0 0' }}>你是店家嗎？ <Link to="/list-your-space">申請刊登 →</Link></p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="grid-cards">
          {rows.map((s) => (
            <article key={s.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 19 }}>{s.business_name}</h2>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-2)' }}>
                    {CATEGORY[s.category]} · {s.city}{s.district ? ` · ${s.district}` : ''}
                  </p>
                </div>
                {s.data_stale ? <span className="badge badge-stale">資料待確認</span> : <span className="badge badge-auth">Authorized Listing</span>}
              </div>
              {s.data_stale && (
                <p className="notice notice-warn" style={{ marginTop: 12, fontSize: 13 }}>已超過更新期限，價格與營業時間暫停顯示，待店家重新確認。</p>
              )}
              <dl className="facts">
                <div><dt>地址</dt><dd>{s.address}</dd></div>
                <div><dt>營業時間</dt><dd>{s.data_stale ? '暫停顯示' : s.opening_hours ?? '—'}</dd></div>
                <div><dt>價格區間</dt><dd>{s.data_stale ? '暫停顯示' : s.price_range ? PRICE[s.price_range] : '—'}</dd></div>
                <div><dt>Wi‑Fi</dt><dd>{s.wifi_available == null ? '—' : s.wifi_available ? '有' : '無'}</dd></div>
                <div><dt>插座</dt><dd>{s.power_outlets ? POWER[s.power_outlets] : '—'}</dd></div>
                <div><dt>大桌面</dt><dd>{yesNo(s.large_tables)}</dd></div>
                <div><dt>設計師聚會</dt><dd>{s.group_friendly == null ? '—' : s.group_friendly ? '可接待團體' : '不接待團體'}</dd></div>
                <div style={{ gridColumn: '1 / -1' }}><dt>活動／講座</dt><dd>{s.supports_events == null ? '—' : s.supports_events ? `可租借辦活動${s.event_capacity ? `，約可容納 ${s.event_capacity} 人` : ''}` : '不提供'}</dd></div>
                <div style={{ gridColumn: '1 / -1' }}><dt>座位與場地資訊</dt><dd>{s.seating_information ?? '—'}</dd></div>
              </dl>
              <p style={{ margin: '14px 0 0', fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {s.official_website && <a href={s.official_website} target="_blank" rel="noopener noreferrer">官方網站</a>}
                {s.official_social_url && <a href={s.official_social_url} target="_blank" rel="noopener noreferrer">官方社群</a>}
              </p>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted-2)' }}>Last Verified Date：{formatDate(s.last_verified_at)}</p>
              <SpaceReviews spaceId={s.id} />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
