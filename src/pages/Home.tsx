import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { ReviewItem, type PublicReview } from '../components/SpaceReviews'
import type { PublicSpace } from './Spaces'
import { CATEGORY, CITIES } from '../lib/labels'
import { supabase } from '../lib/supabase'
import { asset } from '../lib/asset'
import { DEMO_REVIEWS, DEMO_SPACES, SHOW_DEMO } from '../lib/demo'

const HERO_ICONS = [
  ['laptop', '工作空間', '專注創作'],
  ['users', '設計師社群', '交流合作'],
  ['calendar', '活動講座', '學習成長'],
  ['flask', '魔法補給', '靈感與能量'],
  ['compass', '魔法師地圖', '找到附近的創作者'],
] as const

const CONDITIONS = [
  ['power', 'plug', '插座'],
  ['wifi', 'wifi', 'Wi‑Fi'],
  ['nolimit', 'infinity', '不限時'],
  ['minimum', 'price', '低消明確'],
  ['restroom', 'restroom', '有洗手間'],
] as const

const FEATURES = [
  { icon: 'cup', title: '設計師精選空間', sub: '真實評價 × 使用體驗', to: '/spaces' },
  { icon: 'users', title: '設計師社群', sub: '認識同好 × 組隊合作', to: '/community' },
  { icon: 'calendar', title: '設計活動', sub: '講座 × 工作坊 × 展覽', to: '/venues' },
  { icon: 'briefcase', title: '創作機會', sub: '接案 × 合作 × 職缺', to: '/partners' },
  { icon: 'flask', title: '魔法補給站', sub: '專注 × 靈感 × 能量', to: '/resources' },
]

const PARTNERS = [
  { handle: 'socialdesignlab_', url: 'https://www.instagram.com/socialdesignlab_/' },
  { handle: 'pptnight.tw', url: 'https://www.instagram.com/pptnight.tw/' },
]

const DEMO_CHAT = [
  { who: 'Miko_UI', time: '14:21', text: '有人知道台北有不限時又有插座的咖啡店嗎？' },
  { who: 'Ryo_產品設計', time: '14:25', text: '推薦用「探索空間」勾選不限時＋插座，很快就找到！' },
  { who: 'Lemon_時尚設計', time: '14:28', text: '這週有 DDF 設計師聚會，要一起報名嗎？' },
]

const Sparkle = ({ size = 14, color = '#fff' }: { size?: number; color?: string }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 0 14 10 24 12 14 14 12 24 10 14 0 12 10 10z" /></svg>
)
const DemoTag = () => <span className="demo-tag">DEMO</span>

export default function Home() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'work' | 'events'>('work')
  const [city, setCity] = useState('台北市')
  const [category, setCategory] = useState('cafe')
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
    if (mode === 'events') q.set('events', '1')
    for (const [k] of CONDITIONS) if (cond[k]) q.set(k, '1')
    navigate(`/spaces?${q.toString()}`)
  }

  const demoSpaces = spaces.length === 0 && SHOW_DEMO
  const demoReviews = reviews.length === 0 && SHOW_DEMO

  return (
    <>
      {/* HERO */}
      <section className="mg-hero">
        <div className="mg-hero-media">
          <img src={asset('/hero.jpg')} alt="設計師在夜晚的工作據點用筆電與繪圖板創作" />
          <div className="fade" aria-hidden="true" />
        </div>
        <div className="mg-hero-copy">
          <p className="mg-eyebrow"><Sparkle size={11} /> DESIGNER DESK FUEL</p>
          <div className="title-orbit">
            <h1 className="mg-title">
              <span>設計師的工作</span>
              <Sparkle size={18} color="#e7c27a" />
              <span className="gold-text">創意據點</span>
            </h1>
            <p className="mg-sub">找到適合工作的空間 <i>×</i> 認識同頻的設計師 <i>×</i> 激發創作靈感</p>
            <svg className="orbit" viewBox="0 0 800 240" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="orbitGold" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#b98a3e" stopOpacity="0" />
                  <stop offset="0.18" stopColor="#c99a4e" stopOpacity="0.7" />
                  <stop offset="0.7" stopColor="#fff0c8" />
                  <stop offset="0.88" stopColor="#e7c27a" />
                  <stop offset="1" stopColor="#e7c27a" stopOpacity="0" />
                </linearGradient>
                <filter id="orbitGlow" x="-10%" y="-40%" width="120%" height="180%">
                  <feGaussianBlur stdDeviation="2.6" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <path className="orbit-back" d="M690 22 C520 -4 230 4 70 52" />
              <path className="orbit-front" d="M14 226 C130 186 430 188 650 142 C772 116 806 74 776 44 C752 20 716 18 690 22" filter="url(#orbitGlow)" />
              <path className="orbit-shine" d="M14 226 C130 186 430 188 650 142 C772 116 806 74 776 44 C752 20 716 18 690 22" />
            </svg>
            <span className="orbit-star orbit-star-1"><Sparkle size={22} color="#fff0c8" /></span>
            <span className="orbit-star orbit-star-2"><Sparkle size={12} color="#e7c27a" /></span>
          </div>
          <ul className="mg-icons hscroll">
            {HERO_ICONS.map(([icon, a, b]) => (
              <li key={a}><Icon name={icon} size={38} stroke={1.2} /><b>{a}</b><span>{b}</span></li>
            ))}
          </ul>
        </div>
      </section>

      {/* SEARCH */}
      <section className="mg-search" aria-label="搜尋工作空間">
        <div className="mg-tabs" role="tablist" aria-label="搜尋類型">
          <button type="button" role="tab" aria-selected={mode === 'work'} onClick={() => setMode('work')}>
            <Icon name="laptop" size={22} /> 找工作空間
          </button>
          <button type="button" role="tab" aria-selected={mode === 'events'} onClick={() => setMode('events')}>
            <Icon name="calendar" size={22} /> 找活動據點 <small>（講座／工作坊／展覽）</small>
          </button>
        </div>
        <form className="mg-card" onSubmit={search}>
          <label className="mg-sel">
            <Icon name="map" size={22} />
            <span className="sr-only">地區</span>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">全部地區</option>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="mg-sel mg-sel-2">
            <Icon name="laptop" size={22} />
            <span><small>空間類型</small>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">全部類型</option>
                {Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </span>
          </label>
          <fieldset className="mg-conds">
            <legend>工作條件（可多選）</legend>
            {CONDITIONS.map(([k, icon, label]) => (
              <button key={k} type="button" aria-pressed={!!cond[k]} onClick={() => setCond({ ...cond, [k]: !cond[k] })}>
                <Icon name={icon} size={18} stroke={1.8} /> {label}
              </button>
            ))}
          </fieldset>
          <button type="submit" className="btn btn-magic mg-go"><Icon name="search" size={22} stroke={2} /> 搜尋空間</button>
        </form>
      </section>

      {/* FEATURE ROW */}
      <section className="mg-features" aria-label="DDF 功能">
        <ul>
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Link to={f.to}>
                <span className="ic"><Icon name={f.icon} size={26} stroke={1.4} /></span>
                <span><b>{f.title}</b><small>{f.sub}</small></span>
              </Link>
            </li>
          ))}
          <li>
            <Link to="/lounge" className="hl">
              <span className="ic sq"><Icon name="chat" size={26} stroke={1.4} /><i className="dot" /></span>
              <span><b>即時聊天室</b><small>與在地設計師即時交流</small></span>
            </Link>
          </li>
        </ul>
      </section>

      {/* THREE PANELS */}
      <section className="mg-panels">
        <article className="mg-panel mg-vision">
          <Sparkle size={30} />
          <p className="mg-eyebrow" style={{ marginTop: 0 }}>OUR VISION</p>
          <h2 className="serif">為設計師打造<br /><span className="gold-text">工作 × 創作 × 交流 的魔法據點</span></h2>
          <p>身為科技業的設計師，我經常在台北、桃園尋找適合工作的空間，卻總遇到插座不足、筆電電力告急、限時使用，或環境吵雜而無法專心創作。</p>
          <p>我相信，設計師需要的不只是一張桌子，而是一個能自由工作、激發靈感、交流想法的創作基地。</p>
          <span className="ribbon">因此，我們打造 DDF ——</span>
          <p>串連工作空間、設計人才與創意社群，讓每位設計師都能找到創作節奏，發揮更大的魔力。</p>
          <Link to="/about" className="mg-more">閱讀完整故事 →</Link>
        </article>

        <article className="mg-panel mg-map">
          <div className="mg-map-head">
            <Icon name="compass" size={44} stroke={1} color="#e7c27a" />
            <div>
              <h2 className="serif">魔法師地圖 <small>Designer Map</small></h2>
              <p>發現附近的設計師、工作空間與活動</p>
            </div>
          </div>
          <div className="mg-map-body">
            <svg viewBox="0 0 520 300" className="mg-map-svg" role="img" aria-label="台北與桃園地區示意地圖">
              <defs>
                <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7a2e9e" stopOpacity="0.85" /><stop offset="1" stopColor="#3a1458" stopOpacity="0.9" /></linearGradient>
              </defs>
              <path d="M40 220 C70 180 110 160 150 150 C190 138 220 110 260 102 C300 94 330 70 360 50 C380 40 410 46 430 62 C455 82 470 105 462 130 C450 160 420 170 390 185 C350 206 300 215 250 230 C200 246 150 265 110 272 C80 276 50 255 40 220 Z" fill="url(#land)" stroke="#d35be0" strokeWidth="1.5" />
              <g stroke="#f3d7ff" strokeOpacity="0.45" strokeWidth="0.8" fill="none">
                <path d="M90 235 150 190 210 170 270 150 330 110 390 90 430 105" /><path d="M150 190 200 220 260 200 330 170 390 140" />
              </g>
              <g fill="#fff3ff">{[[90, 235], [150, 190], [210, 170], [270, 150], [330, 110], [390, 90], [430, 105], [200, 220], [260, 200], [330, 170], [390, 140]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" />)}</g>
              <g stroke="#e7c27a" strokeWidth="1.3" fill="none"><path d="M392 80V30M384 80h16M386 60h12M388 44h8M380 80h24v6h-24z" /></g>
              <text x="412" y="56" fill="#fff" fontSize="20" fontWeight="700">台北</text><text x="412" y="74" fill="#e9e5f0" fontSize="12">Taipei</text>
              <text x="120" y="258" fill="#fff" fontSize="20" fontWeight="700">桃園</text><text x="120" y="276" fill="#e9e5f0" fontSize="12">Taoyuan</text>
              <g fill="#ff4fa3">{[[330, 110], [210, 170], [270, 150]].map(([x, y]) => <path key={x} d={`M${x} ${y - 16}a8 8 0 0 1 8 8c0 6-8 14-8 14s-8-8-8-14a8 8 0 0 1 8-8z`} stroke="#fff" strokeWidth="1.2" />)}</g>
            </svg>
            <ul className="mg-legend">
              <li><Icon name="users" size={16} /> 設計師</li>
              <li><Icon name="cup" size={16} /> 工作空間</li>
              <li><Icon name="calendar" size={16} /> 設計活動</li>
              <li><Icon name="bolt" size={16} /> 創作熱點</li>
            </ul>
          </div>
          <Link to="/map" className="btn btn-gold mg-map-cta">開啟魔法師地圖 →</Link>
        </article>

        <article className="mg-panel mg-chat" aria-label="DDF 即時聊天室">
          <div className="mg-chat-bar">
            <Icon name="chat" size={18} color="#ffb4e0" />
            <b>DDF 即時聊天室</b>
            {SHOW_DEMO ? <DemoTag /> : <span className="badge badge-muted">即將推出</span>}
            <span className="win" aria-hidden="true"><i /><i /><i /></span>
          </div>
          <div className="mg-chat-body">
            <nav aria-label="聊天室頻道">
              <span className="h">聊天室</span>
              {['General Lounge', 'Workspace', 'Design Talk', 'AI & Technology', 'Collaboration', 'Events'].map((c, i) => (
                <Link key={c} to="/lounge" className={i === 0 ? 'on' : ''}># {c}</Link>
              ))}
            </nav>
            <div className="msgs">
              {SHOW_DEMO ? DEMO_CHAT.map((m) => (
                <div key={m.who} className="msg">
                  <span className="av" aria-hidden="true">{m.who[0]}</span>
                  <div><p className="who"><b>{m.who}</b> {m.time}</p><p className="txt">{m.text}</p></div>
                </div>
              )) : <p className="txt">會員聊天室開發中，上線後會在這裡顯示最新討論。</p>}
              <Link to="/lounge" className="mg-chat-input">輸入訊息…（即將推出）</Link>
            </div>
          </div>
        </article>
      </section>

      {/* PICKS */}
      <section className="mg-section" aria-labelledby="picks-title">
        <div className="mg-sec-head">
          <h2 id="picks-title" className="serif"><Sparkle size={16} color="#e7c27a" /> 設計師精選空間 <small>Designers’ Pick</small></h2>
          <Link to="/spaces">查看更多空間 →</Link>
        </div>
        {demoSpaces && <p className="demo-note">DEMO 示意：以下店家、照片與評分皆為版面示意，並非真實店家，正式上線前移除。</p>}
        <div className="mg-picks hscroll-m">
          {spaces.map((s) => (
            <Link key={s.id} to={`/spaces?city=${encodeURIComponent(s.city)}`} className="mg-pick">
              <div className="img empty"><Icon name="cup" size={40} color="#6b5a7c" /></div>
              <div className="body">
                <h3>{s.business_name}</h3>
                <p><Icon name="map" size={15} /> {s.city}{s.district ? ` · ${s.district}` : ''}</p>
                {s.minimum_charge != null && <p><Icon name="cup" size={15} /> 低消 NT${s.minimum_charge}</p>}
                <p className="tags">
                  {s.power_outlets && s.power_outlets !== 'none' && <span>有插座</span>}
                  {s.wifi_available && <span>Wi‑Fi</span>}
                  {s.no_time_limit && <span>不限時</span>}
                </p>
              </div>
            </Link>
          ))}
          {demoSpaces && DEMO_SPACES.map((s) => (
            <article key={s.name} className="mg-pick">
              <div className="img"><img src={s.img} alt="" /><span className="rating">★ {s.rating} ({s.count})</span><DemoTag /></div>
              <div className="body">
                <h3>{s.name} <small>{s.en}</small></h3>
                <p><Icon name="map" size={15} /> {s.area}</p>
                <p><Icon name="cup" size={15} /> 低消 NT${s.min}</p>
                <p className="tags"><span>有插座</span><span>Wi‑Fi</span><span>不限時</span></p>
              </div>
            </article>
          ))}
        </div>
        {spaces.length === 0 && !SHOW_DEMO && <p className="notice notice-info">目前還沒有公開的空間。<Link to="/list-your-space">店家申請刊登 →</Link></p>}
      </section>

      {/* REVIEWS */}
      <section className="mg-section" aria-labelledby="reviews-title">
        <div className="mg-sec-head">
          <h2 id="reviews-title" className="serif"><Sparkle size={16} color="#e7c27a" /> 設計師真實評價 <small>Real Reviews by Designers</small></h2>
          <Link to="/reviews">看全部評價 →</Link>
        </div>
        {demoReviews && <p className="demo-note">DEMO 示意：以下評價與人物為版面示意，並非真實會員評價，正式上線前移除。</p>}
        {reviews.length > 0 && <ul className="review-list mg-review-list">{reviews.map((r) => <ReviewItem key={r.id} r={r} showSpace />)}</ul>}
        {demoReviews && (
          <div className="mg-reviews hscroll-m">
            {DEMO_REVIEWS.map((r) => (
              <article key={r.name}>
                <img src={r.img} alt="" />
                <div>
                  <p className="who">{r.role}　<b>{r.name}</b> <DemoTag /></p>
                  <p className="stars" aria-label={`DEMO 評分 ${r.stars}`}>{'★'.repeat(Math.floor(r.stars))}{r.stars % 1 ? '½' : ''}</p>
                  <p className="txt">「{r.text}」</p>
                </div>
              </article>
            ))}
          </div>
        )}
        {reviews.length === 0 && !SHOW_DEMO && <p className="notice notice-info">還沒有評價，歡迎 <Link to="/spaces">探索空間</Link> 後分享你的經驗。</p>}
      </section>

      {/* PARTNERS */}
      <section className="mg-partners" aria-label="合作贊助夥伴">
        <div className="t"><b>合作贊助夥伴</b><small>OUR PARTNERS</small></div>
        <div className="logos hscroll-m">
          {PARTNERS.map((p) => (
            <a key={p.handle} href={p.url} target="_blank" rel="noopener noreferrer"><Icon name="instagram" size={20} /> @{p.handle}</a>
          ))}
          {SHOW_DEMO && [1, 2, 3].map((i) => <span key={i} className="demo-slot">贊助夥伴 Logo <DemoTag /></span>)}
        </div>
        <p className="motto">Designers. Spaces.<br />Community. Magic.</p>
        <Link to="/partners" className="btn btn-pill-outline">成為 DDF 贊助夥伴 →</Link>
      </section>
    </>
  )
}
