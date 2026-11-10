import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import MagicMap from '../components/MagicMap'
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

type Designer = { id: string; username: string | null; display_name: string; profession: string | null; bio: string | null; location: string | null; skills: string[]; portfolio_url: string | null; avatar_url: string | null }

export function Community() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Designer[] | null>(null)
  useEffect(() => {
    if (!supabase) return
    const t = setTimeout(() => {
      supabase!.rpc('list_designers', { p_search: q || null, p_limit: 60 }).then(({ data }) => setRows((data ?? []) as Designer[]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="container page">
      <p className="ab-kicker">Designer Community</p>
      <h1>設計師社群</h1>
      <p className="lead">認識同頻的設計師。這裡只顯示選擇公開個人資料的會員；想加入名單，到 <Link to="/account">會員中心</Link> 把公開程度設為「公開」。</p>
      <div className="filters">
        <label className="field" style={{ flex: '1 1 320px' }}>搜尋設計師（名稱、職業、地區、技能）
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：插畫、台北、Figma" />
        </label>
      </div>
      {!supabase && <p className="notice notice-warn">尚未連接 Supabase。</p>}
      {rows && rows.length === 0 && <div className="card">{q ? '沒有符合的設計師。' : '還沒有設計師公開個人資料，成為第一位吧！'} <Link to="/account">編輯我的個人資料 →</Link></div>}
      {rows && rows.length > 0 && (
        <div className="grid-cards">
          {rows.map((d) => (
            <article key={d.id} className="card designer-card">
              <div className="designer-head">
                {d.avatar_url ? <img src={d.avatar_url} alt="" /> : <span className="designer-av" aria-hidden="true">{d.display_name.slice(0, 1)}</span>}
                <div>
                  <h2>{d.display_name}</h2>
                  <p>{[d.profession, d.location].filter(Boolean).join(' · ') || '設計師'}</p>
                </div>
              </div>
              {d.bio && <p className="designer-bio">{d.bio}</p>}
              {d.skills.length > 0 && <p className="review-tags">{d.skills.map((s) => <span key={s} className="badge badge-muted">{s}</span>)}</p>}
              {d.portfolio_url && <a href={d.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-link">作品集 <Icon name="arrow" size={14} stroke={2} /></a>}
            </article>
          ))}
        </div>
      )}
      <h2 style={{ fontSize: 22, margin: '48px 0 14px' }}>聚會與活動</h2>
      <div className="grid-cards">
        <div className="card"><Icon name="users" size={30} color="#ff4f9a" /><h3 style={{ fontSize: 18 }}>設計師聚會</h3><p style={{ color: 'var(--muted)' }}>想找能接待團體的空間？</p><Link to="/spaces?group=1">找聚會場地 →</Link></div>
        <div className="card"><Icon name="calendar" size={30} color="#ff4f9a" /><h3 style={{ fontSize: 18 }}>講座／工作坊</h3><p style={{ color: 'var(--muted)' }}>依容納人數找可租借的活動場地。</p><Link to="/venues">找活動場地 →</Link></div>
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
          <Link to="/contact?plan=brand_sponsor" className="btn btn-magic">查看合作方案・聯絡我們</Link>
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

export function MapPage() {
  return (
    <div className="container page">
      <p className="ab-kicker">Designer Map</p>
      <h1>魔法師地圖</h1>
      <p className="lead">發現附近的設計師、工作空間與活動。互動地圖開發中，目前可先用「探索空間」依地區搜尋已授權刊登的空間。</p>
      <div className="map-stage"><MagicMap /></div>
      <p className="map-credit">地圖資料：內政部，依政府資料開放授權條款使用。</p>
      <div className="actions" style={{ marginTop: 20 }}>
        <Link to="/spaces" className="btn btn-magic">探索空間</Link>
        <span className="badge badge-muted" style={{ alignSelf: 'center' }}>互動地圖即將推出</span>
      </div>
    </div>
  )
}
