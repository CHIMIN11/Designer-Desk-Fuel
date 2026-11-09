import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { ReviewItem, type PublicReview } from '../components/SpaceReviews'
import { supabase } from '../lib/supabase'

export function Reviews() {
  const [rows, setRows] = useState<PublicReview[] | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.rpc('list_public_reviews', { p_space_id: null, p_limit: 50 }).then(({ data }) => setRows((data ?? []) as PublicReview[]))
  }, [])
  return (
    <div className="container page">
      <h1>設計師評價</h1>
      <p className="lead">會員在已刊登空間留下的第一手使用心得。評價屬會員個人意見，DDF 不提供星級、分數或排名。</p>
      {!supabase && <p className="notice notice-warn">尚未連接 Supabase。</p>}
      {rows && rows.length === 0 && <div className="card">還沒有評價。到 <Link to="/spaces">探索空間</Link> 找到你去過的地方，分享你的經驗。</div>}
      {rows && rows.length > 0 && <ul className="review-list">{rows.map((r) => <ReviewItem key={r.id} r={r} showSpace />)}</ul>}
    </div>
  )
}

export function Community() {
  return (
    <div className="container page">
      <h1>社群活動</h1>
      <p className="lead">設計師聚會、講座、工作坊與作品發表。活動報名功能籌備中。</p>
      <div className="grid-cards">
        <div className="card"><Icon name="users" size={30} color="#ff4f9a" /><h2 style={{ fontSize: 19 }}>設計師聚會</h2><p style={{ color: 'var(--muted)' }}>想找能接待團體的空間？</p><Link to="/spaces?group=1">找聚會場地 →</Link></div>
        <div className="card"><Icon name="calendar" size={30} color="#ff4f9a" /><h2 style={{ fontSize: 19 }}>講座／工作坊</h2><p style={{ color: 'var(--muted)' }}>依容納人數找可租借的活動場地。</p><Link to="/venues">找活動場地 →</Link></div>
        <div className="card"><Icon name="instagram" size={30} color="#ff4f9a" /><h2 style={{ fontSize: 19 }}>追蹤活動消息</h2><p style={{ color: 'var(--muted)' }}>最新活動會先在合作夥伴社群公告。</p>
          <a href="https://www.instagram.com/socialdesignlab_/" target="_blank" rel="noopener noreferrer">@socialdesignlab_</a>
          <a href="https://www.instagram.com/pptnight.tw/" target="_blank" rel="noopener noreferrer">@pptnight.tw</a></div>
      </div>
    </div>
  )
}

export function Partners() {
  return (
    <div className="container page">
      <h1>品牌合作</h1>
      <p className="lead">與 DDF 一起支持台灣設計師的工作與創作。合作與贊助不影響空間目錄的刊登與排序，DDF 不提供付費推薦或排名。</p>
      <div className="grid-cards">
        <div className="card"><h2 style={{ fontSize: 19, marginTop: 0 }}>合作夥伴</h2>
          <p><a href="https://www.instagram.com/socialdesignlab_/" target="_blank" rel="noopener noreferrer">@socialdesignlab_</a></p>
          <p><a href="https://www.instagram.com/pptnight.tw/" target="_blank" rel="noopener noreferrer">@pptnight.tw</a></p>
        </div>
        <div className="card"><h2 style={{ fontSize: 19, marginTop: 0 }}>成為 DDF 贊助夥伴</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.8 }}>活動贊助、設計師工具合作、空間合作提案。</p>
          <p className="notice notice-warn" style={{ fontSize: 13 }}>聯絡方式【待確認：合作聯絡 Email】</p>
        </div>
        <div className="card"><h2 style={{ fontSize: 19, marginTop: 0 }}>空間店家</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.8 }}>咖啡店、共享空間、工作室，免費申請授權刊登。</p>
          <Link to="/list-your-space" className="btn btn-pink">店家申請刊登</Link>
        </div>
      </div>
    </div>
  )
}

export function ComingSoon({ title, en, text, to, cta }: { title: string; en: string; text: string; to: string; cta: string }) {
  return (
    <div className="container page">
      <p className="eyebrow">✦ {en.toUpperCase()}</p>
      <h1>{title}</h1>
      <p className="lead">{text}</p>
      <span className="badge badge-muted" style={{ marginRight: 12 }}>即將推出</span>
      <Link to={to} className="btn btn-magic">{cta}</Link>
    </div>
  )
}
