import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDate } from '../lib/labels'
import { supabase } from '../lib/supabase'

export type NewsRow = { id: string; title: string; summary: string | null; body: string; category: string; cover_url: string | null; link_url: string | null; link_label: string | null; pinned: boolean; published_at: string }
export const NEWS_CATS: Record<string, string> = { announcement: '公告', event: '活動', partnership: '合作', update: '網站更新' }

export function fetchNews(limit: number) {
  return supabase!.from('site_news').select('id,title,summary,body,category,cover_url,link_url,link_label,pinned,published_at')
    .order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(limit)
}

export function NewsCard({ n }: { n: NewsRow }) {
  return (
    <Link to={`/news/${n.id}`} className="news-card">
      <div className="news-cover">{n.cover_url ? <img src={n.cover_url} alt="" loading="lazy" /> : <span aria-hidden="true">✦</span>}</div>
      <div className="news-body">
        <p className="news-meta"><span className="news-cat">{NEWS_CATS[n.category] ?? n.category}</span>{n.pinned && <span className="news-pin">置頂</span>}<time dateTime={n.published_at}>{formatDate(n.published_at)}</time></p>
        <h3>{n.title}</h3>
        <p className="news-sum">{n.summary || n.body.slice(0, 80)}</p>
      </div>
    </Link>
  )
}

/** Homepage strip: latest 3. Hidden when there is no news. */
export function NewsStrip() {
  const [rows, setRows] = useState<NewsRow[]>([])
  useEffect(() => { if (supabase) fetchNews(3).then(({ data }) => setRows((data ?? []) as NewsRow[])) }, [])
  if (rows.length === 0) return null
  return (
    <section className="mg-section" aria-labelledby="news-title">
      <div className="mg-sec-head">
        <div><p className="sec-kicker">Latest News</p><h2 id="news-title" className="serif">最新消息</h2></div>
        <Link to="/news">查看全部 →</Link>
      </div>
      <div className="news-grid">{rows.map((n) => <NewsCard key={n.id} n={n} />)}</div>
    </section>
  )
}

export default function News() {
  const [rows, setRows] = useState<NewsRow[] | null>(null)
  const [cat, setCat] = useState('')
  useEffect(() => { if (supabase) fetchNews(60).then(({ data }) => setRows((data ?? []) as NewsRow[])) }, [])
  const shown = (rows ?? []).filter((n) => !cat || n.category === cat)
  return (
    <div className="container page">
      <p className="ab-kicker">Latest News</p>
      <h1>最新消息</h1>
      <p className="lead">DDF 的公告、設計師活動、合作消息與網站更新。</p>
      <div className="chip-row" style={{ margin: '20px 0 24px' }}>
        {[['', '全部'], ...Object.entries(NEWS_CATS)].map(([v, l]) => (
          <button key={v || 'all'} type="button" className={`chip${cat === v ? ' on' : ''}`} onClick={() => setCat(v)}>{l}</button>
        ))}
      </div>
      {!supabase && <p className="notice notice-warn">尚未連接 Supabase。</p>}
      {rows && shown.length === 0 && <div className="card">目前沒有消息。</div>}
      <div className="news-grid">{shown.map((n) => <NewsCard key={n.id} n={n} />)}</div>
    </div>
  )
}

export function NewsDetail() {
  const { id } = useParams()
  const [n, setN] = useState<NewsRow | null | undefined>(undefined)
  useEffect(() => {
    if (!supabase || !id) return
    supabase.from('site_news').select('id,title,summary,body,category,cover_url,link_url,link_label,pinned,published_at').eq('id', id).maybeSingle()
      .then(({ data }) => { setN((data as NewsRow) ?? null); if (data) document.title = `${(data as NewsRow).title}｜DDF 最新消息` })
  }, [id])
  if (n === undefined) return <div className="container page"><p>載入中…</p></div>
  if (n === null) return <div className="container page"><h1>找不到這則消息</h1><Link to="/news">← 回最新消息</Link></div>
  const external = n.link_url?.startsWith('https://')
  return (
    <article className="container page news-article">
      <Link to="/news" className="news-back">← 最新消息</Link>
      <p className="news-meta"><span className="news-cat">{NEWS_CATS[n.category] ?? n.category}</span><time dateTime={n.published_at}>{formatDate(n.published_at)}</time></p>
      <h1>{n.title}</h1>
      {n.summary && <p className="lead">{n.summary}</p>}
      {n.cover_url && <img className="news-hero" src={n.cover_url} alt="" />}
      <div className="news-text">{n.body.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>
      {n.link_url && (external
        ? <a className="btn btn-magic" href={n.link_url} target="_blank" rel="noopener noreferrer">{n.link_label || '了解更多'} ↗</a>
        : <Link className="btn btn-magic" to={n.link_url}>{n.link_label || '了解更多'} →</Link>)}
    </article>
  )
}
