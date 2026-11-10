import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorText, supabase } from '../lib/supabase'

const PLANS = [
  { id: 'space_listing', title: '空間刊登', en: 'Space Listing', tag: '免費', text: '咖啡店、共享空間、工作室，經授權與資料核對後刊登在 DDF 工作空間目錄。', points: ['授權刊登，資料由店家確認', '店家中心自行更新營業資訊', '可上傳 3 張空間照片'] },
  { id: 'brand_sponsor', title: '品牌贊助', en: 'Brand Partnership', tag: '洽談', text: '支持設計師社群的品牌，可贊助聚會、講座或首頁 Banner 曝光。', points: ['首頁 Banner 曝光', '設計師聚會／講座冠名', '合作夥伴頁露出'] },
  { id: 'event', title: '活動與講座合作', en: 'Events & Talks', tag: '洽談', text: '一起舉辦設計師聚會、作品分享、工作坊或展覽。', points: ['活動企劃與場地媒合', '會員社群宣傳', '講者與主題規劃'] },
  { id: 'tool', title: '設計工具合作', en: 'Creative Tools', tag: '洽談', text: '設計軟體、硬體、素材平台，提供設計師專屬體驗或優惠。', points: ['會員專屬優惠', '產品體驗活動', '創作資源專區'] },
  { id: 'media', title: '媒體／社群合作', en: 'Media & Community', tag: '洽談', text: '設計社群、媒體、學校與組織的內容與交流合作。', points: ['內容共創', '社群互推', '校園與組織合作'] },
] as const

export default function Contact() {
  const [params] = useSearchParams()
  const initial = PLANS.some((p) => p.id === params.get('plan')) ? params.get('plan')! : 'brand_sponsor'
  const [plan, setPlan] = useState<string>(initial)
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', message: '', website: '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const pick = (id: string) => {
    setPlan(id)
    document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.website) return setDone(true) // honeypot: bots fill hidden fields
    if (!supabase) return setErr('尚未連接 Supabase。')
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('contact_inquiries').insert({
      plan, name: f.name.trim(), company: f.company.trim() || null, email: f.email.trim(), phone: f.phone.trim() || null, message: f.message.trim(), consent,
    })
    setBusy(false)
    if (error) {
      setErr(/too many inquiries from this email/.test(error.message) ? '這個 Email 今天已送出多筆洽詢，我們會盡快回覆。'
        : /too many inquiries/.test(error.message) ? '目前洽詢較多，請稍後再試。' : errorText(error))
      return
    }
    setDone(true)
  }

  return (
    <div className="container page contact-page">
      <p className="ab-kicker">Contact · Partnership</p>
      <h1>聯絡我們・合作方案</h1>
      <p className="lead">和 DDF 一起支持台灣設計師的工作、創作與交流。選擇合作方向，留下聯絡方式，我們會以 Email 回覆。</p>

      <div className="plan-grid">
        {PLANS.map((p) => (
          <button key={p.id} type="button" className={`plan-card${plan === p.id ? ' on' : ''}`} onClick={() => pick(p.id)} aria-pressed={plan === p.id}>
            <span className="plan-tag">{p.tag}</span>
            <span className="plan-en">{p.en}</span>
            <span className="plan-title">{p.title}</span>
            <span className="plan-text">{p.text}</span>
            <ul>{p.points.map((x) => <li key={x}>{x}</li>)}</ul>
            <span className="plan-cta">{p.id === 'space_listing' ? '洽詢或直接申請 →' : '選擇此方案 →'}</span>
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>贊助與合作不影響空間目錄的刊登審核與排序；DDF 不提供付費推薦或排名。方案內容與費用依合作規模洽談。</p>

      <section id="contact-form" className="contact-wrap">
        {done ? (
          <div className="card contact-done">
            <h2>已收到你的洽詢 ✦</h2>
            <p>謝謝你！我們會盡快以 Email 與你聯繫。</p>
            <Link to="/" className="btn btn-magic">回首頁</Link>
          </div>
        ) : (
          <form className="form card" onSubmit={submit}>
            <h2 style={{ margin: 0, fontSize: 22 }}>合作洽詢</h2>
            {plan === 'space_listing' && <p className="notice notice-info">空間店家也可以直接 <Link to="/list-your-space">申請刊登</Link>，審核較快。</p>}
            <label className="field">合作方向 *
              <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                <option value="other">其他</option>
              </select>
            </label>
            <div className="two">
              <label className="field">聯絡人姓名 *<input required maxLength={60} autoComplete="name" value={f.name} onChange={set('name')} /></label>
              <label className="field">公司／品牌／組織<input maxLength={100} autoComplete="organization" value={f.company} onChange={set('company')} /></label>
              <label className="field">Email *<input required type="email" maxLength={200} autoComplete="email" value={f.email} onChange={set('email')} /></label>
              <label className="field">電話（選填）<input type="tel" maxLength={30} autoComplete="tel" value={f.phone} onChange={set('phone')} /></label>
            </div>
            <label className="field">合作內容 *（20–1000 字）
              <textarea required minLength={20} maxLength={1000} rows={6} placeholder="例：我們是設計軟體品牌，想在 12 月贊助一場台北設計師聚會，預計 50 人…" value={f.message} onChange={set('message')} />
              <span className="hint">{f.message.length}/1000</span>
            </label>
            <label className="hp" aria-hidden="true">網站<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label>
            <label className="check"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} /> 我同意 DDF 使用以上資料聯繫此次合作洽詢（詳見 <Link to="/privacy-policy">隱私權政策</Link>）。</label>
            {err && <p className="notice notice-error" role="alert">{err}</p>}
            <button className="btn btn-magic" type="submit" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? '送出中…' : '送出洽詢'}</button>
          </form>
        )}
      </section>
    </div>
  )
}
