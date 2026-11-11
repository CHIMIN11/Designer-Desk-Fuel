import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/labels'
import { errorText, supabase } from '../lib/supabase'
import { deleteReviewPhotos, uploadReviewPhotos } from '../lib/upload'
import { DISTRICTS } from './FormWidgets'
import ImagePicker from './ImagePicker'
import { REGIONS } from './ProfilePickers'
import { REVIEW_TAGS, ReviewPhotos } from './SpaceReviews'

export type Note = { id: string; place_name: string; city: string | null; district: string | null; map_link: string | null; body: string; tags: string[]; photo_urls: string[]; author_name?: string; status?: string; created_at: string }

export const NOTE_LABEL = '會員親身心得・非店家刊登資訊'
const toDistrictKey = (c: string) => c.replace('臺', '台')

/** One public note card. */
export function NoteItem({ n }: { n: Note }) {
  return (
    <li className="review-card note-card">
      <p className="note-label">{NOTE_LABEL}</p>
      <h3>{n.place_name}<small>{[n.city, n.district].filter(Boolean).join(' ')}</small></h3>
      <p className="review-body">「{n.body}」</p>
      {n.photo_urls.length > 0 && <ReviewPhotos urls={n.photo_urls} />}
      {n.tags.length > 0 && <p className="review-tags">{n.tags.map((t) => <span key={t} className="badge badge-muted">{REVIEW_TAGS[t] ?? t}</span>)}</p>}
      <p className="review-meta">{n.author_name ?? 'DDF 會員'} · {formatDate(n.created_at)}{n.map_link && <> · <a href={n.map_link} target="_blank" rel="noopener noreferrer nofollow">地點連結 ↗</a></>}</p>
    </li>
  )
}

/** Public list of member notes. */
export function PlaceNotesList({ limit = 30 }: { limit?: number }) {
  const [rows, setRows] = useState<Note[] | null>(null)
  useEffect(() => { supabase?.rpc('list_place_notes', { p_limit: limit }).then(({ data }) => setRows((data ?? []) as Note[])) }, [limit])
  if (!rows) return null
  return (
    <section className="notes-section" aria-labelledby="notes-title">
      <div className="mg-sec-head"><div><p className="sec-kicker">Pocket Picks</p><h2 id="notes-title" className="serif">設計師私房據點</h2></div></div>
      <p className="hint" style={{ marginTop: -8 }}>會員分享自己實際去過、適合工作的地方。內容為會員個人經驗，不是 DDF 刊登或店家提供的資訊；店家若希望移除，請 <Link to="/contact?plan=other">聯絡我們</Link>。</p>
      {rows.length === 0 ? <div className="card">還沒有私房據點。到 <Link to="/account?tab=reviews">會員中心</Link> 分享你常去的地方吧！</div>
        : <ul className="review-list">{rows.map((n) => <NoteItem key={n.id} n={n} />)}</ul>}
    </section>
  )
}

const blank = { place_name: '', city: '', district: '', map_link: '', body: '' }

/** Member form: share any place you have worked from (no business authorization needed). */
export function PlaceNoteDesk() {
  const { session } = useAuth()
  const uid = session?.user.id ?? ''
  const [f, setF] = useState(blank)
  const [tags, setTags] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [kept, setKept] = useState<string[]>([])
  const [editing, setEditing] = useState<Note | null>(null)
  const [mine, setMine] = useState<Note[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(() => {
    supabase!.from('place_notes').select('*').eq('author_id', uid).order('created_at', { ascending: false }).then(({ data }) => setMine((data ?? []) as Note[]))
  }, [uid])
  useEffect(() => { if (uid) load() }, [uid, load])

  const reset = () => { setF(blank); setTags([]); setFiles([]); setKept([]); setEditing(null) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    let added: string[] = []
    try { added = await uploadReviewPhotos(files, uid) } catch (err) { setBusy(false); return setMsg({ kind: 'error', text: errorText(err) }) }
    const row = { place_name: f.place_name.trim(), city: f.city || null, district: f.district || null, map_link: f.map_link.trim() || null, body: f.body.trim(), tags, photo_urls: [...kept, ...added] }
    const { error } = editing
      ? await supabase!.from('place_notes').update(row).eq('id', editing.id)
      : await supabase!.from('place_notes').insert(row)
    setBusy(false)
    if (error) {
      await deleteReviewPhotos(added)
      return setMsg({ kind: 'error', text: /too many notes/.test(error.message) ? '今天已分享 5 篇，明天再來吧！' : errorText(error) })
    }
    if (editing) await deleteReviewPhotos(editing.photo_urls.filter((u) => !kept.includes(u)))
    setMsg({ kind: 'ok', text: editing ? '已更新。' : '已分享！你的私房據點已出現在「設計師評價」頁。' })
    reset()
    load()
  }

  const remove = async (n: Note) => {
    if (!window.confirm(`確定刪除「${n.place_name}」？`)) return
    const { error } = await supabase!.from('place_notes').delete().eq('id', n.id)
    if (error) return setMsg({ kind: 'error', text: errorText(error) })
    await deleteReviewPhotos(n.photo_urls)
    load()
  }

  const districts = DISTRICTS[toDistrictKey(f.city)]
  return (
    <section className="form card note-desk">
      <p className="sec-kicker" style={{ margin: 0 }}>Pocket Picks</p>
      <h2 style={{ margin: 0, fontSize: 22 }}>{editing ? '修改私房據點' : '分享你去過的工作據點'}</h2>
      <p className="lead-s">像寫 Google 評論一樣，分享你親自去過、適合工作的地方，不需要店家授權。請只寫你自己的真實經驗，照片也請用自己拍的。</p>
      <form onSubmit={submit} className="suggest-form">
        <div className="two">
          <label className="field">店名／地點名稱 *<input required maxLength={80} value={f.place_name} onChange={(e) => setF({ ...f, place_name: e.target.value })} placeholder="例：鶯歌老街轉角咖啡" /></label>
          <label className="field">縣市
            <select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, district: '' })}>
              <option value="">— 請選擇 —</option>
              {REGIONS.filter((r) => r !== '海外').map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {districts ? (
            <label className="field">行政區
              <select value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })}>
                <option value="">— 請選擇 —</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          ) : (
            <label className="field">行政區<input maxLength={20} value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></label>
          )}
          <label className="field">地點連結（選填，Google 地圖等）<input type="url" pattern="https://.*" maxLength={300} placeholder="https://" value={f.map_link} onChange={(e) => setF({ ...f, map_link: e.target.value })} /></label>
        </div>
        <label className="field">你的使用心得 *（20–1000 字）
          <textarea required minLength={20} maxLength={1000} rows={4} placeholder="例：靠窗那排插座很多，平日下午很安靜，我畫了三小時插畫都沒被催。" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <span className="hint">{f.body.length}/1000</span>
        </label>
        <div className="chip-row">
          {Object.entries(REVIEW_TAGS).map(([k, l]) => (
            <button key={k} type="button" className={`chip${tags.includes(k) ? ' on' : ''}`} aria-pressed={tags.includes(k)} onClick={() => setTags(tags.includes(k) ? tags.filter((t) => t !== k) : [...tags, k])}>{l}</button>
          ))}
        </div>
        {kept.length > 0 && <ReviewPhotos urls={kept} />}
        {kept.length > 0 && <button type="button" className="btn btn-pill-outline" style={{ justifySelf: 'start' }} onClick={() => setKept([])}>移除目前照片</button>}
        {kept.length < 3 && <ImagePicker label="附上自己拍的照片（選填）" max={3 - kept.length} files={files} onChange={setFiles} />}
        <p className="hint" style={{ margin: 0 }}>會以你的顯示名稱公開，標示為「{NOTE_LABEL}」。請勿拍到其他客人的臉或個人資料，也不要使用店家的官方照片或 Logo。</p>
        {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
        <div className="actions">
          <button className="btn btn-magic" type="submit" disabled={busy}>{busy ? '上傳中…' : editing ? '儲存修改' : '分享私房據點'}</button>
          {editing && <button className="btn btn-pill-outline" type="button" onClick={reset}>取消</button>}
        </div>
      </form>
      {mine.length > 0 && (
        <div className="suggest-mine">
          <p className="sec-kicker" style={{ margin: '8px 0 6px' }}>My Pocket Picks（{mine.length}）</p>
          {mine.map((n) => (
            <div key={n.id} className="suggest-row">
              <span>{n.place_name}{n.city && <small> · {n.city}</small>}{n.status === 'hidden' && <small style={{ color: '#ff9cc4' }}> · 已被管理員隱藏</small>}</span>
              <span className="actions" style={{ gap: 6 }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setEditing(n); setF({ place_name: n.place_name, city: n.city ?? '', district: n.district ?? '', map_link: n.map_link ?? '', body: n.body }); setTags(n.tags); setKept(n.photo_urls); setFiles([]); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>編輯</button>
                <button type="button" className="btn btn-ghost" onClick={() => remove(n)}>刪除</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
