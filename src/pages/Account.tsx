import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/labels'
import { errorText, supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import SuggestSpace from '../components/SuggestSpace'
import { PROFESSIONS, REGIONS, SelectOrOther, SkillPicker } from '../components/ProfilePickers'
import ImagePicker from '../components/ImagePicker'
import { PHOTO_NOTE, REVIEW_TAGS, ReviewPhotos } from '../components/SpaceReviews'
import { deleteReviewPhotos, uploadReviewPhotos } from '../lib/upload'

export const MEMBER_TYPE: Record<string, string> = { designer: '設計師', merchant: '店家', other: '其他' }
export const VISIBILITY: Record<string, string> = {
  public: '公開（所有人可見）',
  members: '僅會員可見',
  private: '不公開（只有自己）',
}

type Msg = { kind: 'ok' | 'error'; text: string } | null

function ProfileEditor({ uid }: { uid: string }) {
  const [f, setF] = useState<Record<string, string>>({})
  const [skills, setSkills] = useState<string[]>([])
  const [showPortfolio, setShowPortfolio] = useState(true)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase!.from('profiles').select('*').eq('id', uid).maybeSingle().then(({ data }) => {
      const p = (data ?? {}) as Record<string, unknown>
      setF({
        display_name: (p.display_name as string) ?? '', username: (p.username as string) ?? '',
        member_type: (p.member_type as string) ?? 'designer', profession: (p.profession as string) ?? '',
        location: (p.location as string) ?? '', bio: (p.bio as string) ?? '', portfolio_url: (p.portfolio_url as string) ?? '',
        avatar_url: (p.avatar_url as string) ?? '', profile_visibility: (p.profile_visibility as string) ?? 'private',
      })
      setSkills((p.skills as string[]) ?? [])
      setShowPortfolio((p.show_portfolio as boolean) ?? true)
    })
  }, [uid])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const payload = {
      ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === '' && k !== 'member_type' && k !== 'profile_visibility' ? null : v.trim()])),
      skills: skills.slice(0, 12),
      show_portfolio: showPortfolio,
    }
    // RLS lets a member update only their own row (columns are limited by grants).
    let { data, error } = await supabase!.from('profiles').update(payload).eq('id', uid).select('id')
    if (!error && (data ?? []).length === 0) {
      // Account created before profiles existed: create the row.
      ;({ data, error } = await supabase!.from('profiles').insert({ id: uid, ...payload }).select('id'))
    }
    setBusy(false)
    if (error) {
      const t = /duplicate key.*username/.test(error.message) ? '這個帳號代稱已被使用，請換一個。' : errorText(error)
      return setMsg({ kind: 'error', text: t })
    }
    setMsg({ kind: 'ok', text: '已儲存個人資料。' })
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <form className="form" onSubmit={save}>
      <fieldset>
        <legend>公開程度</legend>
        <label className="field">誰可以看到我的個人資料
          <select value={f.profile_visibility ?? 'private'} onChange={set('profile_visibility')}>
            {Object.entries(VISIBILITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="hint">預設不公開。選「公開」後會出現在「設計師社群」名單；Email 永遠不會公開。</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>基本資料</legend>
        <div className="two">
          <label className="field">顯示名稱 *<input required maxLength={60} value={f.display_name ?? ''} onChange={set('display_name')} /></label>
          <label className="field">帳號代稱（選填，小寫英數與底線）<input pattern="[a-z0-9_]{3,30}" placeholder="例：miko_ui" value={f.username ?? ''} onChange={set('username')} /></label>
          <label className="field">身分
            <select value={f.member_type ?? 'designer'} onChange={set('member_type')}>
              {Object.entries(MEMBER_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <SelectOrOther label="職業／專長" options={PROFESSIONS} value={f.profession ?? ''} onChange={(v) => setF({ ...f, profession: v })} maxLength={60} placeholder="例：遊戲美術" />
          <SelectOrOther label="所在地區" options={REGIONS} value={f.location ?? ''} onChange={(v) => setF({ ...f, location: v })} maxLength={40} placeholder="例：東京" />
        </div>
        <SkillPicker value={skills} onChange={setSkills} />
        <label className="field">自我介紹<textarea maxLength={500} value={f.bio ?? ''} onChange={set('bio')} /><span className="hint">{(f.bio ?? '').length}/500</span></label>
      </fieldset>
      <fieldset>
        <legend>作品與頭像</legend>
        <div className="two">
          <label className="field">作品集網址<input type="url" pattern="https://.*" placeholder="https://" value={f.portfolio_url ?? ''} onChange={set('portfolio_url')} /></label>
          <label className="field">頭像圖片網址<input type="url" pattern="https://.*" placeholder="https://" value={f.avatar_url ?? ''} onChange={set('avatar_url')} /><span className="hint">圖片上傳功能將於設定 Storage 後開放</span></label>
        </div>
        <label className="check"><input type="checkbox" checked={showPortfolio} onChange={(e) => setShowPortfolio(e.target.checked)} /> 公開我的作品集連結</label>
      </fieldset>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      <button className="btn btn-magic" type="submit" disabled={busy} style={{ justifySelf: 'start', minHeight: 48 }}>{busy ? '儲存中…' : '儲存個人資料'}</button>
    </form>
  )
}

type MyReview = { id: string; space_id: string; business_name: string; body: string; tags: string[]; photo_urls: string[]; status: string; space_public: boolean; created_at: string; updated_at: string }
type SpaceOption = { id: string; business_name: string; city: string; district: string | null }

function ReviewDesk({ uid }: { uid: string }) {
  const [mine, setMine] = useState<MyReview[]>([])
  const [spaces, setSpaces] = useState<SpaceOption[]>([])
  const [spaceId, setSpaceId] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [kept, setKept] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([supabase!.rpc('list_my_reviews'), supabase!.rpc('list_public_spaces', {})])
    setMine((m.data ?? []) as MyReview[])
    setSpaces((s.data ?? []) as SpaceOption[])
  }, [])
  useEffect(() => { load() }, [load])

  const reviewed = new Set(mine.map((r) => r.space_id))
  const reset = () => { setEditing(null); setSpaceId(''); setBody(''); setTags([]); setFiles([]); setKept([]) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    let added: string[] = []
    try { added = await uploadReviewPhotos(files, uid) } catch (err) { setBusy(false); return setMsg({ kind: 'error', text: errorText(err) }) }
    const photo_urls = [...kept, ...added]
    const before = editing ? mine.find((r) => r.id === editing)?.photo_urls ?? [] : []
    const { error } = editing
      ? await supabase!.from('space_reviews').update({ body, tags, photo_urls }).eq('id', editing)
      : await supabase!.from('space_reviews').insert({ space_id: spaceId, author_id: uid, body, tags, photo_urls })
    setBusy(false)
    if (error) await deleteReviewPhotos(added)
    else await deleteReviewPhotos(before.filter((u) => !kept.includes(u)))
    if (error) return setMsg({ kind: 'error', text: /duplicate key/.test(error.message) ? '你已評價過這個空間，可在下方修改。' : errorText(error) })
    setMsg({ kind: 'ok', text: editing ? '已更新評價。' : '已發表評價，感謝分享！' })
    reset()
    load()
  }

  const remove = async (id: string) => {
    if (!window.confirm('確定要刪除這則評價嗎？')) return
    const photos = mine.find((r) => r.id === id)?.photo_urls ?? []
    const { error } = await supabase!.from('space_reviews').delete().eq('id', id)
    if (!error) await deleteReviewPhotos(photos)
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已刪除評價。' })
    load()
  }

  const edit = (r: MyReview) => { setEditing(r.id); setSpaceId(r.space_id); setBody(r.body); setTags(r.tags); setKept(r.photo_urls ?? []); setFiles([]); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="review-desk">
      {!editing && spaces.length === 0 ? <SuggestSpace empty /> : (
      <form className="form card" onSubmit={submit}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{editing ? '修改評價' : '撰寫評價'}</h2>
        {editing ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>空間：{mine.find((r) => r.id === editing)?.business_name}</p>
        ) : (
          <label className="field">選擇你去過的空間 *
            <select required value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              <option value="">— 請選擇 —</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id} disabled={reviewed.has(s.id)}>
                  {s.business_name}（{s.city}{s.district ? ` ${s.district}` : ''}）{reviewed.has(s.id) ? '・已評價' : ''}
                </option>
              ))}
            </select>
            {spaces.length === 0 && <span className="hint">目前還沒有已公開的空間可以評價。</span>}
          </label>
        )}
        <label className="field">你的第一手使用心得 *（10–500 字）
          <textarea required minLength={10} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="例：插座在靠窗那排，平日下午很好找位子，適合專心畫圖。" />
          <span className="hint">{body.length}/500</span>
        </label>
        <div className="chips" role="group" aria-label="標籤">
          {Object.entries(REVIEW_TAGS).map(([k, l]) => (
            <button key={k} type="button" className="chip chip-dark" aria-pressed={tags.includes(k)} onClick={() => setTags(tags.includes(k) ? tags.filter((t) => t !== k) : [...tags, k])}>{l}</button>
          ))}
        </div>
        {kept.length > 0 && (
          <div className="review-photos">
            {kept.map((u, i) => (
              <div key={u} className="picker-item">
                <img src={u} alt={`目前的照片 ${i + 1}`} />
                <button type="button" aria-label={`移除第 ${i + 1} 張照片`} onClick={() => setKept(kept.filter((x) => x !== u))}><Icon name="close" size={16} stroke={2.2} /></button>
              </div>
            ))}
          </div>
        )}
        {kept.length < 3 && <ImagePicker label="附上照片（選填）" max={3 - kept.length} files={files} onChange={setFiles} />}
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)' }}>{PHOTO_NOTE}</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)' }}>評價以你的顯示名稱公開，不會顯示 Email。請分享親身經驗；不實、廣告或騷擾內容會被管理員隱藏。</p>
        {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
        <div className="actions">
          <button className="btn btn-magic" type="submit" disabled={busy}>{busy ? '上傳中…' : editing ? '儲存修改' : '發表評價'}</button>
          {editing && <button className="btn btn-pill-outline" type="button" onClick={reset}>取消修改</button>}
        </div>
      </form>
      )}
      {spaces.length > 0 && !editing && <SuggestSpace empty={false} />}

      <h2 style={{ fontSize: 20, margin: '32px 0 12px' }}>我的評價（{mine.length}）</h2>
      {mine.length === 0 && <p style={{ color: 'var(--muted)' }}>你還沒有發表評價。</p>}
      <ul className="review-list">
        {mine.map((r) => (
          <li key={r.id} className="review">
            <p className="review-meta">
              <b>{r.business_name}</b> · {formatDate(r.created_at)}
              {r.updated_at !== r.created_at && ' · 已編輯'}
              {r.status === 'hidden' && <span className="badge badge-stale" style={{ marginLeft: 8 }}>已被管理員隱藏</span>}
              {!r.space_public && <span className="badge badge-muted" style={{ marginLeft: 8 }}>空間目前未公開</span>}
            </p>
            <p className="review-body">「{r.body}」</p>
            {r.photo_urls?.length > 0 && <ReviewPhotos urls={r.photo_urls} />}
            {r.tags.length > 0 && <p className="review-tags">{r.tags.map((t) => <span key={t} className="badge badge-muted">{REVIEW_TAGS[t] ?? t}</span>)}</p>}
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btn btn-pill-outline" type="button" onClick={() => edit(r)}>修改</button>
              <button className="btn btn-danger" type="button" onClick={() => remove(r.id)}>刪除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const TABS = [['profile', '個人資料'], ['reviews', '我的評價']] as const

export default function Account() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'reviews' ? 'reviews' : 'profile'

  if (!supabase) return <div className="container page"><p className="notice notice-warn">尚未連接 Supabase。</p></div>
  if (!session) return <div className="container page"><h1>會員中心</h1><p>請先 <Link to="/login?next=/account">登入</Link>。</p></div>

  return (
    <div className="container page">
      <p className="ab-kicker">Member Center</p>
      <h1>會員中心</h1>
      <p className="lead">管理你的設計師個人資料與評價。經營空間的店家，請到 <Link to="/merchant">店家中心</Link>。</p>
      <div className="admin-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`btn ${tab === id ? 'btn-magic' : 'btn-pill-outline'}`} onClick={() => setParams(id === 'profile' ? {} : { tab: id })}>{label}</button>
        ))}
      </div>
      {tab === 'profile' ? <ProfileEditor uid={session.user.id} /> : <ReviewDesk uid={session.user.id} />}
    </div>
  )
}
