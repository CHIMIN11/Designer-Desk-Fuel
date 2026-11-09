import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { CATEGORY, CITIES, PRICE } from '../lib/labels'
import { supabase } from '../lib/supabase'
import { ReviewItem, type PublicReview } from '../components/SpaceReviews'

const HERO_ICONS = [
  ['plug', '插座資訊', '店家提供'],
  ['seat', '座位資訊', '桌面與座位'],
  ['clock', '營業時間', '含用餐時限'],
  ['price', '價格區間', '消費資訊'],
  ['map', '探索空間', '附近的空間'],
] as const

const FEATURES = [
  ['shield', '授權刊登', 'Authorized Listing'],
  ['doc', '店家提供資訊', '營業時間 × 價格 × 官方連結'],
  ['plug', '插座與 Wi‑Fi', '客觀設備資訊'],
  ['seat', '座位與場地', '座位 × 桌面 × 用餐時限'],
  ['calendar', '最後確認日期', '逾期自動標示待確認'],
] as const

const USE_CASES = [
  { title: '一人工作', sub: '插座 × Wi‑Fi', img: '/usecase-solo.jpg', query: 'power=1&wifi=1' },
  { title: '繪圖／修圖', sub: '大桌面 × 插座', img: '/usecase-drawing.jpg', query: 'tables=1&power=1' },
  { title: '辦活動／講座', sub: '場地與容納人數', img: '/usecase-events.jpg', query: 'events=1' },
  { title: '設計師聚會', sub: '可接待團體', img: '/usecase-meetup.jpg', query: 'group=1' },
]

const PARTNERS = [
  { handle: 'socialdesignlab_', url: 'https://www.instagram.com/socialdesignlab_/' },
  { handle: 'pptnight.tw', url: 'https://www.instagram.com/pptnight.tw/' },
]

export default function Home() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'work' | 'events'>('work')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [price, setPrice] = useState('')
  const [wifi, setWifi] = useState(true)
  const [power, setPower] = useState(true)
  const [reviews, setReviews] = useState<PublicReview[]>([])

  useEffect(() => {
    supabase?.rpc('list_public_reviews', { p_space_id: null, p_limit: 6 }).then(({ data }) => setReviews((data ?? []) as PublicReview[]))
  }, [])

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    const q = new URLSearchParams()
    if (category) q.set('category', category)
    if (mode === 'events') q.set('events', '1')
    if (city) q.set('city', city)
    if (price) q.set('price', price)
    if (wifi) q.set('wifi', '1')
    if (power) q.set('power', '1')
    navigate(`/spaces?${q.toString()}`)
  }

  return (
    <>
      <section className="hero">
        <div className="hero-media">
          <img src="/hero.jpg" alt="設計師帶著筆電與繪圖板在咖啡店工作" />
          <div className="fade" aria-hidden="true" />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">✦ DESIGNER DESK FUEL</p>
          <h1 className="serif hero-title">
            設計師的<br />
            工作空間 <span className="times">×</span> <span className="underline">創意據點</span>
          </h1>
          <p className="sub">查詢授權刊登的工作空間 × 插座 Wi‑Fi 一次看清 × 一個人也自在</p>
          <ul className="hero-icons">
            {HERO_ICONS.map(([icon, title, sub]) => (
              <li key={title}>
                <Icon name={icon} size={40} stroke={1.3} />
                <b>{title}</b>
                <span>{sub}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container search-wrap" aria-label="搜尋工作空間">
        <div className="tabs" role="tablist" aria-label="搜尋類型">
          <button type="button" role="tab" aria-selected={mode === 'work'} className="tab" onClick={() => setMode('work')}>
            找工作空間 <small>（咖啡店／工作基地）</small>
          </button>
          <button type="button" role="tab" aria-selected={mode === 'events'} className="tab" onClick={() => setMode('events')}>
            找活動場地 <small>（講座／工作坊／聚會）</small>
          </button>
        </div>
        <form className="search-card" onSubmit={search}>
          <label className="field-light">
            地區
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">全部地區</option>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field-light">
            空間類型
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">全部類型</option>
              {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field-light">
            價格區間
            <select value={price} onChange={(e) => setPrice(e.target.value)}>
              <option value="">不限價格</option>
              {Object.entries(PRICE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <fieldset style={{ border: 0, margin: 0, padding: 0, flex: '999 1 300px' }}>
            <legend style={{ fontSize: 12, color: '#5e566b', marginBottom: 6, padding: 0 }}>空間資訊（依店家提供資料篩選）</legend>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={wifi} onClick={() => setWifi(!wifi)}>Wi‑Fi</button>
              <button type="button" className="chip" aria-pressed={power} onClick={() => setPower(!power)}>插座</button>
            </div>
          </fieldset>
          <button type="submit" className="btn btn-primary" style={{ minHeight: 52, fontSize: 17, padding: '0 28px' }}>
            <Icon name="search" size={20} stroke={2} /> 搜尋空間
          </button>
        </form>
        <ul className="usecases" aria-label="依用途找空間">
          {USE_CASES.map((u) => (
            <li key={u.title}>
              <Link to={`/spaces?${u.query}`} className="usecase">
                <img src={u.img} alt="" />
                <span><b>{u.title}</b><small>{u.sub}</small></span>
                <span className="go" aria-hidden="true"><Icon name="arrow" size={16} stroke={2.2} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="container">
        <ul className="features" aria-label="目錄刊登原則">
          {FEATURES.map(([icon, title, sub]) => (
            <li key={title} className="feature">
              <span className="ic"><Icon name={icon} size={26} stroke={1.5} /></span>
              <span><b>{title}</b><small>{sub}</small></span>
            </li>
          ))}
          <li>
            <Link to="/list-your-space" className="feature feature-hl">
              <span className="ic" style={{ borderRadius: 14 }}><Icon name="store" size={26} stroke={1.5} /></span>
              <span><b>店家申請刊登</b><small>List Your Space →</small></span>
            </Link>
          </li>
        </ul>

        <section className="panels">
          <article className="panel" id="about">
            <p className="eyebrow" style={{ fontSize: 13 }}>✦ WORK. CREATE. CONNECT. REFUEL.</p>
            <h2 className="serif">設計師的工作・<span className="gold-text">創意據點</span></h2>
            <p>身為科技業設計師，經常在台北與桃園尋找適合工作的空間。卻總遇到插座不足、筆電電力告急、限時使用，或環境吵雜而無法專心創作的困境。</p>
            <p>我相信，設計師需要的不只是一張桌子，而是一個能自由工作、激發靈感、交流想法的創作基地。</p>
            <span className="ribbon">因此，我們打造 DDF。</span>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 20, color: 'var(--gold)' }}>Find Your Space. Fuel Your Magic.</p>
            <Link to="/about" className="btn btn-ghost">閱讀完整故事 →</Link>
          </article>

          <article className="panel" style={{ flex: '1.4 1 420px', display: 'flex', flexDirection: 'column' }}>
            <h2 className="serif" style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
              探索空間 <span style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 500 }}>Workspace Directory</span>
            </h2>
            <p>查詢已取得店家授權、經資料核對後公開的工作空間。每筆資料都標示最後確認日期；超過複查期限的價格與營業時間會暫停顯示。</p>
            <ul style={{ color: '#d6d1de', fontSize: 14, lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
              <li>只顯示客觀資訊：地區、類別、價格區間、Wi‑Fi、插座、營業時間、座位</li>
              <li>不做推薦、評分或排名</li>
              <li>店家可隨時申請更新、暫停或撤回刊登</li>
            </ul>
            <Link to="/spaces" className="btn btn-gold" style={{ alignSelf: 'center', marginTop: 'auto', minHeight: 48, padding: '0 30px', fontSize: 17 }}>
              開啟探索空間 <Icon name="arrow" size={18} stroke={2} />
            </Link>
          </article>

          <article className="panel" style={{ background: '#fff', color: '#221c2b', borderColor: '#e9d8f5' }}>
            <p style={{ color: '#5e566b', margin: 0, fontSize: 13, letterSpacing: '0.2em' }}>FOR BUSINESSES</p>
            <h2 className="serif" style={{ color: '#221c2b' }}>店家刊登流程</h2>
            <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 2, color: '#3a3346' }}>
              <li>店家提交申請與授權範圍</li>
              <li>DDF 驗證申請人身份與授權資格</li>
              <li>核對地址、價格、營業時間與官方連結</li>
              <li>審核通過後才公開上架</li>
              <li>可隨時申請修改、暫停或撤回</li>
            </ol>
            <p style={{ color: '#5e566b', fontSize: 13 }}>送出申請不代表自動取得刊登資格。刊登不代表推薦、認證或品質保證。</p>
            <Link to="/list-your-space" className="btn btn-primary">我是店家，申請刊登</Link>
          </article>
        </section>

        <section className="home-reviews" aria-labelledby="reviews-title">
          <h2 id="reviews-title">設計師真實評價 <small>Real Reviews by Designers</small></h2>
          {reviews.length > 0 ? (
            <ul className="review-list">{reviews.map((r) => <ReviewItem key={r.id} r={r} showSpace />)}</ul>
          ) : (
            <p className="notice notice-info">
              這裡會顯示會員在已刊登空間留下的第一手心得，不使用星級或排名。目前還沒有評價，歡迎 <Link to="/spaces">探索空間</Link> 後分享你的經驗。
            </p>
          )}
        </section>

        <section className="partners" aria-label="合作贊助夥伴">
          <div style={{ paddingRight: 24, borderRight: '1px solid var(--line-2)' }}>
            <p style={{ margin: 0, fontSize: 17 }}>合作贊助夥伴</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, letterSpacing: '0.22em', color: 'var(--muted)' }}>OUR PARTNERS</p>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', flex: '1 1 auto' }}>
            {PARTNERS.map((p) => (
              <a key={p.handle} href={p.url} target="_blank" rel="noopener noreferrer" className="partner">
                <Icon name="instagram" size={18} /> @{p.handle}
              </a>
            ))}
          </div>
          <p style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 19, lineHeight: 1.35 }}>
            Designers. Spaces.<br />Community. Magic.
          </p>
        </section>
      </div>
    </>
  )
}
