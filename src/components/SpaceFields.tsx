import { CATEGORY, CITIES, POWER, PRICE } from '../lib/labels'

/** Editable space data as form strings ('' = not provided, 'yes'/'no' for booleans). */
export type SpaceDraft = Record<(typeof FIELD_KEYS)[number], string>

export const FIELD_KEYS = [
  'business_name', 'category', 'city', 'district', 'address', 'official_website', 'official_social_url', 'contact_email',
  'price_range', 'minimum_charge', 'opening_hours', 'wifi_available', 'power_outlets', 'no_time_limit', 'has_restroom',
  'large_tables', 'group_friendly', 'supports_events', 'event_capacity', 'seating_information',
] as const

const BOOL_KEYS = ['wifi_available', 'no_time_limit', 'has_restroom', 'large_tables', 'group_friendly', 'supports_events']
const INT_KEYS = ['minimum_charge', 'event_capacity']

export const emptyDraft = (): SpaceDraft =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, k === 'category' ? 'cafe' : k === 'city' ? '台北市' : ''])) as SpaceDraft

/** Row from the database → form draft. */
export function toDraft(row: Record<string, unknown>): SpaceDraft {
  const d = emptyDraft()
  for (const k of FIELD_KEYS) {
    const v = row[k]
    if (v === null || v === undefined) d[k] = ''
    else if (typeof v === 'boolean') d[k] = v ? 'yes' : 'no'
    else d[k] = String(v)
  }
  return d
}

/** Form draft → JSON payload for the database functions. */
export function toPayload(d: SpaceDraft, only?: (keyof SpaceDraft)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of only ?? FIELD_KEYS) {
    const v = d[k]
    if (BOOL_KEYS.includes(k)) out[k] = v === '' ? null : v === 'yes'
    else if (INT_KEYS.includes(k)) out[k] = v === '' ? null : Number(v)
    else out[k] = v.trim()
  }
  return out
}

export function changedKeys(before: SpaceDraft, after: SpaceDraft) {
  return FIELD_KEYS.filter((k) => before[k] !== after[k])
}

function YesNo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">不提供</option><option value="yes">是</option><option value="no">否</option>
      </select>
    </label>
  )
}

export default function SpaceFields({ value, onChange }: { value: SpaceDraft; onChange: (d: SpaceDraft) => void }) {
  const set = (k: keyof SpaceDraft) => (v: string) => onChange({ ...value, [k]: v })
  const ev = (k: keyof SpaceDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k)(e.target.value)

  return (
    <>
      <fieldset>
        <legend>基本資料</legend>
        <div className="two">
          <label className="field">店家名稱 *<input required maxLength={120} value={value.business_name} onChange={ev('business_name')} /></label>
          <label className="field">類別 *
            <select value={value.category} onChange={ev('category')}>
              {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">縣市 *
            <select value={value.city} onChange={ev('city')}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="field">行政區<input maxLength={40} value={value.district} onChange={ev('district')} /></label>
        </div>
        <label className="field">地址 *<input required maxLength={200} value={value.address} onChange={ev('address')} /></label>
        <div className="two">
          <label className="field">官方網站<input type="url" pattern="https://.*" placeholder="https://" value={value.official_website} onChange={ev('official_website')} /></label>
          <label className="field">官方社群<input type="url" pattern="https://.*" placeholder="https://" value={value.official_social_url} onChange={ev('official_social_url')} /></label>
          <label className="field">店家聯絡 Email *（不公開）<input required type="email" value={value.contact_email} onChange={ev('contact_email')} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>工作條件</legend>
        <div className="two">
          <label className="field">價格區間
            <select value={value.price_range} onChange={ev('price_range')}>
              <option value="">不提供</option>
              {Object.entries(PRICE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">低消（NT$，無低消填 0）<input type="number" min={0} max={10000} value={value.minimum_charge} onChange={ev('minimum_charge')} /></label>
          <YesNo label="Wi‑Fi" value={value.wifi_available} onChange={set('wifi_available')} />
          <label className="field">插座
            <select value={value.power_outlets} onChange={ev('power_outlets')}>
              <option value="">不提供</option>
              {Object.entries(POWER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <YesNo label="不限用餐時間" value={value.no_time_limit} onChange={set('no_time_limit')} />
          <YesNo label="店內有洗手間" value={value.has_restroom} onChange={set('has_restroom')} />
          <YesNo label="大桌面（可放繪圖板）" value={value.large_tables} onChange={set('large_tables')} />
          <YesNo label="可接待設計師聚會" value={value.group_friendly} onChange={set('group_friendly')} />
          <YesNo label="可辦活動／講座" value={value.supports_events} onChange={set('supports_events')} />
          {value.supports_events === 'yes' && (
            <label className="field">活動可容納人數<input type="number" min={1} max={2000} value={value.event_capacity} onChange={ev('event_capacity')} /></label>
          )}
        </div>
        <label className="field">營業時間（含用餐時限）<textarea maxLength={500} value={value.opening_hours} onChange={ev('opening_hours')} /></label>
        <label className="field">座位與場地資訊<textarea maxLength={500} value={value.seating_information} onChange={ev('seating_information')} /></label>
      </fieldset>
    </>
  )
}
