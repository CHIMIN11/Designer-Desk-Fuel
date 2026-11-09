import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { ReviewItem, type PublicReview } from '../components/SpaceReviews'
import type { PublicSpace } from './Spaces'
import { CATEGORY, CITIES, PRICE } from '../lib/labels'
import { supabase } from '../lib/supabase'
import { DEMO_REVIEWS, DEMO_SPACES, SHOW_DEMO } from '../lib/demo'

const HERO_ICONS = [
  ['laptop', '獨立工作', '深度創作'],
  ['users', '設計師交流', '社群活動'],
  ['calendar', '講座／工作坊', '作品發表'],
  ['pen', '設計靈感', '空間策展'],
] as const

const CONDITIONS = [
  ['power', '有插座'],
  ['wifi', '免費 Wi‑Fi'],
  ['nolimit', '不限時'],
  ['minimum', '低消明確'],
  ['restroom', '有洗手間'],
] as const

const USE_CASES = [
  { title: '一人工作', sub: '專注不被打擾', img: '/usecase-solo.jpg', query: 'power=1&wifi=1' },
  { title: '繪圖／修圖', sub: '適合創作設備', img: '/usecase-drawing.jpg', query: 'tables=1&power=1' },
  { title: '辦活動／講座', sub: '場地與設備', img: '/usecase-events.jpg', query: 'events=1' },
  { title: '設計師聚會', sub: '交流 ＋ 人脈', img: '/usecase-meetup.jpg', query: 'group=1' },
]

const IDEALS = [
  ['laptop', '讓設計師有更多自由工作的選擇'],
  ['users', '打造活躍的設計師交流社群'],
  ['layers', '串連空間、活動與創意資源'],
  ['chart', '成為台灣設計師的創意能量平台'],
] as const

const PARTNERS = [
  { handle: 'socialdesignlab_', url: 'https://www.instagram.com/socialdesignlab_/' },
  { handle: 'pptnight.tw', url: 'https://www.instagram.com/pptnight.tw/' },
]

function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`DEMO 評分 ${value}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={value >= i ? 'on' : value >= i - 0.5 ? 'half' : ''} aria-hidden="true">★</span>
      ))}
    </span>
  )
}

const DemoTag = () => <span className="demo-tag">DEMO</span>

export default function Home() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'work' | 'events'>('work')
  const [city, setCity] = useState('台北市')
  const [category, setCategory] = useState('cafe')
  const [price, setPrice] = useState('')
  const [cond, setCond] = useState<Record<string, boolean>>({ power: true, wifi: true, nolimit: true })
  const [spaces, setSpaces] = useState<PublicSpace[]>([])
  const [reviews, setReviews] = useState<PublicReview[]>([])

  useEffect(() => {
    if (!supabase) return
    supabase.rpc('list_public_spaces', {}).then(({ data }) => setSpaces(((data ?? []) as PublicSpace[]).slice(0, 4)))
    supabase.rpc('list_public_reviews', { p_space_id: null, p_limit: 3 }).then(({ data }) => setReviews((data ?? []) as PublicReview[]))
  }, [])

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    const q = new URLSearchParams()
    if (city) q.set('city', city)
    if (category) q.set('category', category)
    if (price) q.set('price', price)
    if (mode === 'events') q.set('events', '1')
    for (const [k] of CONDITIONS) if (cond[k]) q.set(k, '1')
    navigate(`/spaces?${q.toString()}`)
  }

  const showDemoSpaces = spaces.length === 0 && SHOW_DEMO
  const showDemoReviews = reviews.length === 0 && SHOW_DEMO

  return (
    <>
      {/* HERO */}
      <section className="hero2">
        <div className="hero2-media">
          <img src="/hero-2.jpg" alt="設計師帶著筆電在咖啡店構思作品" />
          <div className="fade" aria-hidden="true" />
        </div>
        <div className="hero2-copy">
          <p className="eyebrow">DESIGNER DESK FUEL</p>
          <h1>
            設計師的<br />
            工作空間 <span className="times">×</span> <span className="swoosh">創意據點</span>
          </h1>
          <p className="sub">找一個能專注工作、激發靈感，<br />也能舉辦活動、認識同好的地方。</p>
          <ul className="hero2-icons">
            {HERO_ICONS.map(([icon, a, b]) => (
              <li key={a}>
                <Icon name={icon} size={36} stroke={1.4} color="#ff4f9a" />
                <span>{a}<br />{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* SEARCH */}
      <section className="search2" aria-label="搜尋工作空間">
        <div className="container">
          <div className="tabs2" role="tablist" aria-label="搜尋類型">
            <button type="button" role="tab" aria-selected={mode === 'work'} onClick={() => setMode('work')}>
              <Icon name="laptop" size={22} /> 找工作空間 <small>（咖啡店／工作基地）</small>
            </button>
            <button type="button" role="tab" aria-selected={mode === 'events'} onClick={() => setMode('events')}>
              <Icon name="calendar" size={22} /> 找活動場地 <small>（講座／工作坊／聚會）</small>
            </button>
          </div>
          <form className="search2-card" onSubmit={search}>
            <label className="sel">
              <Icon name="map" size={22} />
              <span><small>選擇地區</small>
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">全部地區</option>
                  {CITIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </span>
            </label>
            <label className="sel">
              <Icon name="cup" size={22} />
              <span><small>空間類型</small>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">全部類型</option>
                  {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </span>
            </label>
            <label className="sel">
              <Icon name="price" size={22} />
              <span><small>價格區間</small>
                <select value={price} onChange={(e) => setPrice(e.target.value)}>
                  <option value="">不限價格</option>
                  {Object.entries(PRICE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </span>
            </label>
            <fieldset className="conds">
              <legend>設計師工作條件</legend>
              {CONDITIONS.map(([k, label]) => (
                <label key={k}>
                  <input type="checkbox" checked={!!cond[k]} onChange={(e) => setCond({ ...cond, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="btn btn-pink search2-go"><Icon name="search" size={22} stroke={2} /> 搜尋空間</button>
          </form>

          <ul className="usecases2" aria-label="依用途找空間">
            {USE_CASES.map((u) => (
              <li key={u.title}>
                <Link to={`/spaces?${u.query}`}>
                  <img src={u.img} alt="" />
                  <span><b>{u.title}</b><small>{u.sub}</small></span>
                  <span className="go" aria-hidden="true"><Icon name="arrow" size={16} stroke={2.4} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FOUNDER */}
      <section className="founder" aria-labelledby="founder-title">
        <div className="founder-photo">
          <img src="/founder.jpg" alt="DDF 發起人" />
          <p className="founder-sign"><small>發起人 / Founder</small><span>Chimin_design</span></p>
        </div>
        <div className="founder-copy">
          <h2 id="founder-title">發起人與我的理想 <em>Founder’s Vision</em></h2>
          <blockquote>
            「為設計師打造一個<br />
            工作 × <span>創作</span> × <span className="blue">交流</span> × <span>發聲</span>的基地。」
          </blockquote>
          <p>
            我是一位設計師，也曾在城市中不斷尋找適合工作的咖啡店、能舉辦活動的空間，以及可以認識同好的創意社群。
            因此，我創立了 Designer Desk Fuel（DDF），希望讓每一位設計師都能更容易找到理想的工作場域、舉辦活動、分享作品，並在這裡遇見一起創造的夥伴。
          </p>
        </div>
        <div className="founder-ideals">
          <h3>我的理想</h3>
          <ul>
            {IDEALS.map(([icon, text]) => (
              <li key={text}><Icon name={icon} size={26} stroke={1.5} color="#ff4f9a" />{text}</li>
            ))}
          </ul>
          <Link to="/about" className="btn btn-outline-pink">閱讀完整故事 →</Link>
        </div>
      </section>

      {/* LIGHT SECTION */}
      <div className="light">
        <section className="container picks" aria-labelledby="picks-title">
          <div className="sec-head">
            <h2 id="picks-title">設計師精選空間 <em>Designers’ Pick</em></h2>
            <Link to="/spaces">查看更多空間 →</Link>
          </div>
          {showDemoSpaces && (
            <p className="demo-note">DEMO 示意：以下店家、照片與評分皆為版面示意，並非真實店家，正式上線前移除。</p>
          )}
          <div className="picks-grid">
            {spaces.length > 0 && spaces.map((s) => (
              <Link key={s.id} to={`/spaces?city=${encodeURIComponent(s.city)}`} className="pick">
                <div className="pick-img pick-img-empty"><Icon name="cup" size={40} color="#c9c3d3" /></div>
                <div className="pick-body">
                  <h3>{s.business_name}</h3>
                  <p><Icon name="map" size={16} /> {s.city}{s.district ? ` · ${s.district}` : ''}</p>
                  {s.minimum_charge != null && <p><Icon name="cup" size={16} /> 低消 NT${s.minimum_charge}</p>}
                  <p className="pick-tags">
                    {s.power_outlets && s.power_outlets !== 'none' && <span>有插座</span>}
                    {s.wifi_available && <span>Wi‑Fi</span>}
                    {s.no_time_limit && <span>不限時</span>}
                  </p>
                </div>
              </Link>
            ))}
            {showDemoSpaces && DEMO_SPACES.map((s) => (
              <article key={s.name} className="pick">
                <div className="pick-img">
                  <img src={s.img} alt="" />
                  <span className="rating">★ {s.rating} ({s.count})</span>
                  <DemoTag />
                </div>
                <div className="pick-body">
                  <h3>{s.name} <small>{s.en}</small></h3>
                  <p><Icon name="map" size={16} /> {s.area}</p>
                  <p><Icon name="cup" size={16} /> 低消 NT${s.min}</p>
                  <p className="pick-tags"><span>有插座</span><span>Wi‑Fi</span><span>不限時</span></p>
                </div>
              </article>
            ))}
            <aside className="join">
              <h3>加入 DDF 社群</h3>
              <p>與更多設計師一起<br />探索、分享、創造！</p>
              <Link to="/login?mode=signup" className="btn btn-pink">免費註冊 »</Link>
              <ul>
                <li>查詢授權刊登的工作空間</li>
                <li>發表設計師評價</li>
                <li>店家申請刊登</li>
              </ul>
            </aside>
          </div>
          {spaces.length === 0 && !SHOW_DEMO && (
            <p className="empty-light">目前還沒有公開的空間。<Link to="/list-your-space">店家申請刊登 →</Link></p>
          )}
        </section>

        <section className="container reviews2" aria-labelledby="reviews-title">
          <div className="sec-head">
            <h2 id="reviews-title">設計師真實評價 <em>Real Reviews by Designers</em></h2>
            <Link to="/reviews">看全部評價 →</Link>
          </div>
          {showDemoReviews && <p className="demo-note">DEMO 示意：以下評價與人物為版面示意，並非真實會員評價，正式上線前移除。</p>}
          {reviews.length > 0 && <ul className="review-list review-list-light">{reviews.map((r) => <ReviewItem key={r.id} r={r} showSpace />)}</ul>}
          {showDemoReviews && (
            <div className="reviews2-grid">
              {DEMO_REVIEWS.map((r) => (
                <article key={r.name} className="rv">
                  <img src={r.img} alt="" />
                  <div>
                    <p className="rv-who">{r.role}　<b>{r.name}</b> <DemoTag /></p>
                    <Stars value={r.stars} />
                    <p className="rv-text">「{r.text}」</p>
                  </div>
                </article>
              ))}
            </div>
          )}
          {reviews.length === 0 && !SHOW_DEMO && <p className="empty-light">還沒有評價，歡迎 <Link to="/spaces">探索空間</Link> 後分享你的經驗。</p>}
        </section>
      </div>

      {/* PARTNERS */}
      <section className="partners2" aria-label="合作贊助夥伴">
        <div className="container partners2-row">
          <div className="p-title"><b>合作贊助夥伴</b><small>OUR PARTNERS</small></div>
          <div className="p-logos">
            {PARTNERS.map((p) => (
              <a key={p.handle} href={p.url} target="_blank" rel="noopener noreferrer" className="partner2">
                <Icon name="instagram" size={20} /> @{p.handle}
              </a>
            ))}
            {SHOW_DEMO && [1, 2, 3].map((i) => <span key={i} className="partner2 partner2-demo">贊助夥伴 Logo <DemoTag /></span>)}
          </div>
          <Link to="/partners" className="btn btn-outline-light">成為 DDF 贊助夥伴 →</Link>
        </div>
      </section>
    </>
  )
}
