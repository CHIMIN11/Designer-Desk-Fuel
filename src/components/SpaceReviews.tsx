import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/labels'
import { errorText, supabase } from '../lib/supabase'
import { deleteReviewPhotos, uploadReviewPhotos } from '../lib/upload'
import ImagePicker from './ImagePicker'

export type PublicReview = {
  id: string
  space_id: string
  business_name: string
  author_name: string
  body: string
  tags: string[]
  photo_urls?: string[]
  created_at: string
}

export const REVIEW_TAGS: Record<string, string> = {
  power_ok: '插座好找',
  wifi_ok: 'Wi‑Fi 穩定',
  large_table: '桌面夠大',
  quiet: '適合專注',
  good_for_events: '適合辦活動',
  good_for_meetups: '適合聚會',
}

export function ReviewItem({ r, showSpace = false }: { r: PublicReview; showSpace?: boolean }) {
  return (
    <li className="review">
      <p className="review-meta">
        <b>{r.author_name}</b> · {formatDate(r.created_at)}
        {showSpace && <> · <Link to={`/spaces`}>{r.business_name}</Link></>}
      </p>
      <p className="review-body">「{r.body}」</p>
      {r.photo_urls && r.photo_urls.length > 0 && <ReviewPhotos urls={r.photo_urls} />}
      {r.tags.length > 0 && (
        <p className="review-tags">{r.tags.map((t) => <span key={t} className="badge badge-muted">{REVIEW_TAGS[t] ?? t}</span>)}</p>
      )}
    </li>
  )
}

export function ReviewPhotos({ urls }: { urls: string[] }) {
  return (
    <div className="review-photos">
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" aria-label={`查看評價照片 ${i + 1}（另開視窗）`}>
          <img src={u} alt={`評價照片 ${i + 1}`} loading="lazy" />
        </a>
      ))}
    </div>
  )
}

export const PHOTO_NOTE = '最多 3 張。請勿拍到其他客人的臉、螢幕或個人資料；照片會跟評價一起公開。'

/** Real member reviews for one public space. No star ratings, scores or rankings. */
export default function SpaceReviews({ spaceId }: { spaceId: string }) {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PublicReview[]>([])
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('list_public_reviews', { p_space_id: spaceId, p_limit: 20 })
    setRows((data ?? []) as PublicReview[])
  }, [spaceId])

  useEffect(() => { if (open) load() }, [open, load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !session) return
    setBusy(true)
    let photo_urls: string[] = []
    try { photo_urls = await uploadReviewPhotos(files, session.user.id) } catch (err) { setBusy(false); return setMsg({ kind: 'error', text: errorText(err) }) }
    // author_id must equal the signed-in user; RLS rejects anything else.
    const { error } = await supabase.from('space_reviews').insert({ space_id: spaceId, author_id: session.user.id, body, tags, photo_urls })
    setBusy(false)
    if (error) {
      await deleteReviewPhotos(photo_urls)
      setMsg({ kind: 'error', text: /duplicate key/.test(error.message) ? '你已評價過這個空間。' : errorText(error) })
      return
    }
    setBody('')
    setTags([])
    setFiles([])
    setMsg({ kind: 'ok', text: '感謝分享！' })
    load()
  }

  return (
    <div className="reviews">
      <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)} style={{ minHeight: 40, fontSize: 14 }}>
        設計師真實評價 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {rows.length === 0 && <p className="hint" style={{ color: 'var(--muted-2)', fontSize: 13 }}>還沒有評價。</p>}
          <ul className="review-list">{rows.map((r) => <ReviewItem key={r.id} r={r} />)}</ul>
          {session ? (
            <form className="form" onSubmit={submit} style={{ marginTop: 12 }}>
              <label className="field">分享你的第一手使用心得（10–500 字）
                <textarea required minLength={10} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
              <div className="chips" role="group" aria-label="標籤">
                {Object.entries(REVIEW_TAGS).map(([k, l]) => (
                  <button key={k} type="button" className="chip chip-dark" aria-pressed={tags.includes(k)}
                    onClick={() => setTags(tags.includes(k) ? tags.filter((t) => t !== k) : [...tags, k])}>{l}</button>
                ))}
              </div>
              <ImagePicker label="附上照片（選填）" max={3} files={files} onChange={setFiles} />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)' }}>{PHOTO_NOTE}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)' }}>評價會以你的顯示名稱公開，不會顯示 Email。請分享親身經驗，不實或廣告內容會被隱藏。</p>
              {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
              <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }} disabled={busy}>{busy ? '上傳中…' : '送出評價'}</button>
            </form>
          ) : (
            <p style={{ fontSize: 13 }}><Link to="/login?next=/spaces">登入</Link> 後即可分享評價。</p>
          )}
        </div>
      )}
    </div>
  )
}
