import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { CATEGORY, CITIES, POWER, PRICE } from '../lib/labels'
import { errorText, supabase } from '../lib/supabase'
import ImagePicker from '../components/ImagePicker'
import ListingPreview from '../components/ListingPreview'
import { uploadSpaceImage } from '../lib/upload'

export const TERMS_VERSION = '2026-11-draft'

const empty = {
  business_name: '', category: 'cafe', city: '台北市', district: '', address: '',
  official_website: '', official_social_url: '', price_range: '', opening_hours: '',
  wifi_available: '', power_outlets: '', seating_information: '', contact_email: '',
  large_tables: '', supports_events: '', event_capacity: '', group_friendly: '',
  no_time_limit: '', minimum_charge: '', has_restroom: '',
  applicant_name: '', applicant_position: '', applicant_email: '',
  }

const tri = (v: string) => (v === '' ? null : v === 'yes')

const YesNo = ({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void }) => (
  <label className="field">{label}
    <select value={value} onChange={onChange}>
      <option value="">不提供</option><option value="yes">是</option><option value="no">否</option>
    </select>
  </label>
)

export default function ListYourSpace() {
  const { session } = useAuth()
  const [f, setF] = useState(empty)
  const [scope, setScope] = useState({ photos: false, logo: false, official_text: false })
  const [accepted, setAccepted] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [logo, setLogo] = useState<File[]>([])
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const upd = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { data: spaceId, error } = await supabase.rpc('submit_space_application', {
      p_space: {
        business_name: f.business_name, category: f.category, city: f.city, district: f.district, address: f.address,
        official_website: f.official_website, official_social_url: f.official_social_url,
        price_range: f.price_range, opening_hours: f.opening_hours,
        wifi_available: f.wifi_available === '' ? null : f.wifi_available === 'yes',
        power_outlets: f.power_outlets, seating_information: f.seating_information, contact_email: f.contact_email,
        large_tables: tri(f.large_tables), supports_events: tri(f.supports_events),
        event_capacity: f.supports_events === 'yes' && f.event_capacity ? Number(f.event_capacity) : null,
        group_friendly: tri(f.group_friendly),
        no_time_limit: tri(f.no_time_limit), has_restroom: tri(f.has_restroom),
        minimum_charge: f.minimum_charge === '' ? null : Number(f.minimum_charge),
      },
      p_authorization: {
        applicant_name: f.applicant_name, applicant_position: f.applicant_position, applicant_email: f.applicant_email,
        accepted_terms: accepted, terms_version: TERMS_VERSION, scope,
      },
    })
    if (error) {
      setBusy(false)
      setError(errorText(error))
      return
    }
    // Upload chosen images; each is stored as pending until an admin grants it.
    const uploads: [string, File][] = [
      ...(scope.photos ? photos.map((f) => ['photo', f] as [string, File]) : []),
      ...(scope.logo ? logo.map((f) => ['logo', f] as [string, File]) : []),
    ]
    const failed: string[] = []
    for (const [i, [type, file]] of uploads.entries()) {
      setProgress(`上傳圖片 ${i + 1}/${uploads.length}…`)
      try {
        const url = await uploadSpaceImage(file, session!.user.id, spaceId as string)
        const { error: aErr } = await supabase.rpc('add_space_asset', { p_space_id: spaceId, p_asset_type: type, p_asset_url: url, p_scope: 'DDF 目錄刊登頁面' })
        if (aErr) throw aErr
      } catch {
        failed.push(file.name)
      }
    }
    setProgress('')
    if (failed.length) setError(`申請已送出，但這些圖片未能上傳：${failed.join('、')}。可稍後在「店家中心」補上。`)
    setBusy(false)
    setDone(true)
  }

  return (
    <div className="container page">
      <h1>店家申請刊登</h1>
      <p className="lead">
        List Your Space：DDF 是工作空間資訊目錄，只刊登經店家本人或授權代表同意的資訊。送出申請<strong>不代表</strong>自動取得刊登資格，
        需經身份驗證與資料核對後才會公開。刊登不代表 DDF 推薦、認證、背書或品質保證。
      </p>

      {!supabase && <p className="notice notice-warn">尚未連接 Supabase，申請表暫時無法送出。</p>}
      {supabase && !session && (
        <div className="card">
          <p style={{ marginTop: 0 }}>申請刊登前請先登入或註冊帳號，之後你可以用同一個帳號管理刊登、申請更新或撤回授權。</p>
          <Link className="btn btn-primary" to="/login?next=/list-your-space">登入 / 註冊</Link>
        </div>
      )}

      {done && (
        <div className="notice notice-ok" role="status">
          已收到你的申請。DDF 會以 Email 與你確認身份與授權資格，審核通過並核對資料後才會公開。你可以在 <Link to="/merchant">店家中心</Link> 查看進度。
        </div>
      )}

      {supabase && session && !done && (
        <div className="lys-layout">
        <form className="form" onSubmit={submit}>
          <fieldset>
            <legend>空間資訊</legend>
            <div className="two">
              <label className="field">店家名稱 *<input required maxLength={120} value={f.business_name} onChange={upd('business_name')} /></label>
              <label className="field">店家類別 *
                <select value={f.category} onChange={upd('category')}>
                  {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field">縣市 *
                <select value={f.city} onChange={upd('city')}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="field">行政區<input maxLength={40} value={f.district} onChange={upd('district')} /></label>
            </div>
            <label className="field">營業地址 *<input required maxLength={200} value={f.address} onChange={upd('address')} /></label>
            <div className="two">
              <label className="field">官方網站<input type="url" pattern="https://.*" placeholder="https://" value={f.official_website} onChange={upd('official_website')} /></label>
              <label className="field">官方社群<input type="url" pattern="https://.*" placeholder="https://" value={f.official_social_url} onChange={upd('official_social_url')} /></label>
              <label className="field">消費價格
                <select value={f.price_range} onChange={upd('price_range')}>
                  <option value="">不提供</option>
                  {Object.entries(PRICE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field">Wi‑Fi
                <select value={f.wifi_available} onChange={upd('wifi_available')}>
                  <option value="">不提供</option><option value="yes">有</option><option value="no">無</option>
                </select>
              </label>
              <label className="field">插座
                <select value={f.power_outlets} onChange={upd('power_outlets')}>
                  <option value="">不提供</option>
                  {Object.entries(POWER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <div className="two">
              <YesNo label="不限用餐時間" value={f.no_time_limit} onChange={upd('no_time_limit')} />
              <YesNo label="店內有洗手間" value={f.has_restroom} onChange={upd('has_restroom')} />
              <label className="field">低消金額（NT$，無低消填 0）<input type="number" min={0} max={10000} value={f.minimum_charge} onChange={upd('minimum_charge')} /></label>
              <YesNo label="有可放筆電＋繪圖板的大桌面" value={f.large_tables} onChange={upd('large_tables')} />
              <YesNo label="可接待設計師聚會（團體）" value={f.group_friendly} onChange={upd('group_friendly')} />
              <YesNo label="可租借辦活動／講座／工作坊" value={f.supports_events} onChange={upd('supports_events')} />
              {f.supports_events === 'yes' && (
                <label className="field">活動可容納人數<input type="number" min={1} max={2000} value={f.event_capacity} onChange={upd('event_capacity')} /></label>
              )}
            </div>
            <label className="field">營業時間（含用餐時限）<textarea maxLength={500} value={f.opening_hours} onChange={upd('opening_hours')} placeholder="例：週二至週日 09:00–20:00，平日無用餐時限，假日 2 小時" /></label>
            <label className="field">座位與場地資訊<textarea maxLength={500} value={f.seating_information} onChange={upd('seating_information')} placeholder="例：單人座 8 席、長桌 2 張" /></label>
          </fieldset>

          <fieldset>
            <legend>聯絡人（不公開）</legend>
            <div className="two">
              <label className="field">聯絡人姓名 *<input required maxLength={80} value={f.applicant_name} onChange={upd('applicant_name')} /></label>
              <label className="field">聯絡職稱 *<input required maxLength={80} value={f.applicant_position} onChange={upd('applicant_position')} placeholder="例：負責人、店長" /></label>
              <label className="field">聯絡 Email *<input required type="email" value={f.applicant_email} onChange={upd('applicant_email')} /></label>
              <label className="field">店家聯絡 Email *<input required type="email" value={f.contact_email} onChange={upd('contact_email')} /></label>
            </div>
            <p className="hint" style={{ margin: 0, fontSize: 12, color: '#8f8a9c' }}>聯絡資料僅用於身份驗證、授權確認與資料更新通知，不會公開顯示。</p>
          </fieldset>

          <fieldset>
            <legend>素材與授權範圍</legend>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.8 }}>
              店家資料刊登為必要授權。照片、Logo、官方文字介紹需分別勾選授權；未勾選的素材不會被使用。素材需經 DDF 確認後才會顯示。
            </p>
            <label className="check"><input type="checkbox" checked disabled /> 店家資料刊登授權（名稱、地址、類別、營業時間、價格、設備與座位資訊）</label>
            <label className="check"><input type="checkbox" checked={scope.photos} onChange={(e) => setScope({ ...scope, photos: e.target.checked })} /> 照片使用授權</label>
            {scope.photos && <ImagePicker label="店家照片" max={3} files={photos} onChange={setPhotos} />}
            <label className="check"><input type="checkbox" checked={scope.logo} onChange={(e) => setScope({ ...scope, logo: e.target.checked })} /> Logo 使用授權</label>
            {scope.logo && <ImagePicker label="品牌 Logo" max={1} files={logo} onChange={setLogo} />}
            <label className="check"><input type="checkbox" checked={scope.official_text} onChange={(e) => setScope({ ...scope, official_text: e.target.checked })} /> 官方文字介紹使用授權</label>
          </fieldset>

          <div className="card">
            <label className="check">
              <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>
                我是此店家的負責人或經授權的代表，已閱讀並同意 <Link to="/listing-terms" target="_blank">店家刊登授權條款</Link> 與{' '}
                <Link to="/asset-guidelines" target="_blank">素材使用規範</Link>（版本 {TERMS_VERSION}，草稿待法律審閱）。
                我了解授權不代表廣告代言、推薦或品質保證，並可隨時申請修改、暫停或撤回。
              </span>
            </label>
          </div>

          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || !accepted} style={{ justifySelf: 'start', minHeight: 50, padding: '0 28px' }}>
            {busy ? progress || '送出中…' : '送出刊登申請'}
          </button>
        </form>
        <aside className="lys-preview" aria-label="刊登示意">
          <ListingPreview f={f} photos={scope.photos ? photos : []} logo={scope.logo ? logo : []} />
        </aside>
        </div>
      )}
    </div>
  )
}
