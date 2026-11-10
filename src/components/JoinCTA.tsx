import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** Site-wide "join / contact" band above the footer. Original illustration, no third-party assets. */
export default function JoinCTA() {
  const { session } = useAuth()
  const paths = [
    { to: session ? '/account' : '/login?mode=signup', k: 'DESIGNERS', t: session ? '完善你的設計師檔案' : '成為 DDF 魔法師', d: '收藏工作空間、留下真實評價、加入即時聊天室。', cta: session ? '前往會員中心' : '免費註冊' },
    { to: '/list-your-space', k: 'SPACES', t: '讓設計師找到你的空間', d: '咖啡店、共享空間、工作室，授權後免費刊登。', cta: '申請刊登' },
    { to: '/contact', k: 'PARTNERS', t: '一起打造創作據點', d: '品牌贊助、活動講座、設計工具與社群合作。', cta: '聯絡我們' },
  ]
  return (
    <section className="join" aria-labelledby="join-title">
      <svg className="join-art" viewBox="0 0 400 400" aria-hidden="true">
        <defs>
          <linearGradient id="jGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1c7" /><stop offset="1" stopColor="#a8792e" /></linearGradient>
        </defs>
        <circle cx="200" cy="200" r="180" fill="none" stroke="url(#jGold)" strokeOpacity=".5" />
        <circle cx="200" cy="200" r="168" fill="none" stroke="#f3d58f" strokeOpacity=".2" />
        <g className="join-spin">
          {Array.from({ length: 72 }, (_, k) => <line key={k} x1="200" y1="32" x2="200" y2={k % 6 ? 38 : 46} stroke="#f3d58f" strokeOpacity={k % 6 ? 0.3 : 0.7} transform={`rotate(${k * 5} 200 200)`} />)}
        </g>
        <circle cx="200" cy="200" r="110" fill="none" stroke="#ff7bb8" strokeOpacity=".35" strokeDasharray="2 8" />
        <polygon points="200,90 295,255 105,255" fill="none" stroke="#c9a7ff" strokeOpacity=".3" />
        <polygon points="200,310 105,145 295,145" fill="none" stroke="#c9a7ff" strokeOpacity=".3" />
        <path d="M200 160 C204 190 210 196 240 200 C210 204 204 210 200 240 C196 210 190 204 160 200 C190 196 196 190 200 160Z" fill="url(#jGold)" />
      </svg>
      <div className="container join-inner">
        <div className="join-head">
          <p className="ab-kicker">Join the Magic</p>
          <h2 id="join-title">加入 DDF，<br /><span>讓創作有個好據點</span></h2>
          <p>不論你是設計師、空間店家或品牌夥伴，都可以在這裡找到屬於你的位置。</p>
        </div>
        <div className="join-cards">
          {paths.map((p) => (
            <Link key={p.k} to={p.to} className="join-card">
              <span className="k">{p.k}</span>
              <span className="t">{p.t}</span>
              <span className="d">{p.d}</span>
              <span className="c">{p.cta} <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
