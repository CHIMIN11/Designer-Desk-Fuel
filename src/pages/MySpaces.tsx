import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ImagePicker from '../components/ImagePicker'
import { useAuth } from '../lib/auth'
import { AUTH_STATUS, CATEGORY, PUB_STATUS, formatDate } from '../lib/labels'
import { errorText, supabase } from '../lib/supabase'
import { uploadSpaceImage } from '../lib/upload'

type MySpace = {
  id: string; business_name: string; category: string; city: string; district: string | null
  opening_hours: string | null; seating_information: string | null
  authorization_status: string; publication_status: string
  last_verified_at: string | null; next_review_at: string | null
}
type Asset = { id: string; space_id: string; asset_type: string; asset_url: string; permission_status: string }
type Msg = { kind: 'ok' | 'error'; text: string } | null

const ASSET_STATUS: Record<string, [string, string]> = {
  pending: ['待 DDF 確認', 'badge-stale'],
  granted: ['已確認，可公開顯示', 'badge-auth'],
  revoked: ['已撤回', 'badge-muted'],
}

function SpaceCard({ s, assets, uid, onChanged, setMsg }: { s: MySpace; assets: Asset[]; uid: string; onChanged: () => void; setMsg: (m: Msg) => void }) {
  const [editing, setEditing] = useState(false)
  const [hours, setHours] = useState(s.opening_hours ?? '')
  const [seating, setSeating] = useState(s.seating_information ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState('')
  const active = assets.filter((a) => a.permission_status !== 'revoked')
  const photoSlots = 3 - active.filter((a) => a.asset_type === 'photo').length
  const withdrawn = s.authorization_status === 'withdrawn'

  const act = async (action: 'pause' | 'withdraw') => {
    const label = action === 'pause' ? '暫停刊登' : '撤回授權（所有圖片授權也會一併撤回）'
    if (!window.confirm(`確定要${label}嗎？`)) return
    const { error } = await supabase!.rpc('merchant_set_listing', { p_space_id: s.id, p_action: action, p_reason: null })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: action === 'pause' ? '已暫停刊登。' : '已撤回授權，空間已從公開目錄移除。' })
    onChanged()
  }

  const requestUpdate = async () => {
    const changes: Record<string, string> = {}
    if (hours !== (s.opening_hours ?? '')) changes.opening_hours = hours
    if (seating !== (s.seating_information ?? '')) changes.seating_information = seating
    if (Object.keys(changes).length === 0) return setMsg({ kind: 'error', text: '沒有變更內容。' })
    const { error } = await supabase!.rpc('request_space_update', { p_space_id: s.id, p_changes: changes })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已送出更新申請，DDF 審核後才會更新公開資訊。' })
    setEditing(false)
  }

  const upload = async () => {
    const failed: string[] = []
    for (const [i, f] of files.entries()) {
      setBusy(`上傳 ${i + 1}/${files.length}…`)
      try {
        const url = await uploadSpaceImage(f, uid, s.id)
        const { error } = await supabase!.rpc('add_space_asset', { p_space_id: s.id, p_asset_type: 'photo', p_asset_url: url, p_scope: 'DDF 目錄刊登頁面' })
        if (error) throw error
      } catch { failed.push(f.name) }
    }
    setBusy('')
    setFiles([])
    setMsg(failed.length ? { kind: 'error', text: `未能上傳：${failed.join('、')}` } : { kind: 'ok', text: '已上傳，DDF 確認後才會公開顯示。' })
    onChanged()
  }

  const removeAsset = async (a: Asset) => {
    if (!window.confirm('確定要撤回這張圖片嗎？撤回後會立即停止顯示。')) return
    const { error } = await supabase!.rpc('merchant_remove_asset', { p_asset_id: a.id })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已撤回圖片。' })
    onChanged()
  }

  return (
    <article className="card biz-card">
      <div className="biz-head">
        <div>
          <h2>{s.business_name}</h2>
          <p>{CATEGORY[s.category]} · {s.city}{s.district ? ` ${s.district}` : ''}</p>
        </div>
        <span className={`badge ${s.publication_status === 'published' ? 'badge-auth' : 'badge-muted'}`}>{PUB_STATUS[s.publication_status]}</span>
      </div>
      <dl className="facts">
        <div><dt>授權狀態</dt><dd>{AUTH_STATUS[s.authorization_status]}</dd></div>
        <div><dt>刊登狀態</dt><dd>{PUB_STATUS[s.publication_status]}</dd></div>
        <div><dt>最後確認</dt><dd>{formatDate(s.last_verified_at)}</dd></div>
        <div><dt>下次複查</dt><dd>{formatDate(s.next_review_at)}</dd></div>
      </dl>

      <h3 className="biz-sub">店家圖片</h3>
      {active.length === 0 && <p className="biz-empty">還沒有圖片。</p>}
      <div className="biz-photos">
        {assets.map((a) => (
          <figure key={a.id} className={a.permission_status === 'revoked' ? 'is-revoked' : ''}>
            <img src={a.asset_url} alt={a.asset_type === 'logo' ? 'Logo' : '店家照片'} loading="lazy" />
            <figcaption>
              <span className={`badge ${ASSET_STATUS[a.permission_status][1]}`}>{a.asset_type === 'logo' ? 'Logo・' : ''}{ASSET_STATUS[a.permission_status][0]}</span>
              {a.permission_status !== 'revoked' && <button type="button" className="biz-link" onClick={() => removeAsset(a)}>撤回</button>}
            </figcaption>
          </figure>
        ))}
      </div>
      {!withdrawn && photoSlots > 0 && (
        <div style={{ marginTop: 12 }}>
          <ImagePicker label={`新增店家照片・還可上傳 ${photoSlots} 張`} max={photoSlots} files={files} onChange={setFiles} />
          {files.length > 0 && <button type="button" className="btn btn-magic" style={{ marginTop: 10 }} disabled={!!busy} onClick={upload}>{busy || `上傳 ${files.length} 張`}</button>}
        </div>
      )}

      {editing ? (
        <div className="form" style={{ marginTop: 16 }}>
          <label className="field">營業時間<textarea value={hours} onChange={(e) => setHours(e.target.value)} maxLength={500} /></label>
          <label className="field">座位與場地資訊<textarea value={seating} onChange={(e) => setSeating(e.target.value)} maxLength={500} /></label>
          <div className="actions">
            <button className="btn btn-magic" type="button" onClick={requestUpdate}>送出更新申請</button>
            <button className="btn btn-pill-outline" type="button" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      ) : (
        <div className="actions" style={{ marginTop: 16 }}>
          {!withdrawn && <button className="btn btn-pill-outline" type="button" onClick={() => setEditing(true)}>申請更新資料</button>}
          {s.publication_status === 'published' && <button className="btn btn-pill-outline" type="button" onClick={() => act('pause')}>暫停刊登</button>}
          {!withdrawn && <button className="btn btn-danger" type="button" onClick={() => act('withdraw')}>撤回授權</button>}
        </div>
      )}
    </article>
  )
}

/** 店家中心 — separate from the designer member center. */
export default function MySpaces() {
  const { session } = useAuth()
  const [rows, setRows] = useState<MySpace[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    if (!supabase || !session) return
    // RLS returns only the spaces (and their assets) this account manages.
    const [s, a] = await Promise.all([
      supabase.from('spaces').select('id,business_name,category,city,district,opening_hours,seating_information,authorization_status,publication_status,last_verified_at,next_review_at').order('created_at', { ascending: false }),
      supabase.from('space_assets').select('id,space_id,asset_type,asset_url,permission_status').order('created_at'),
    ])
    if (s.error) setMsg({ kind: 'error', text: errorText(s.error) })
    setRows((s.data ?? []) as MySpace[])
    setAssets((a.data ?? []) as Asset[])
  }, [session])
  useEffect(() => { load() }, [load])

  if (!supabase) return <div className="container page"><p className="notice notice-warn">尚未連接 Supabase。</p></div>
  if (!session) return <div className="container page"><h1>店家中心</h1><p>請先 <Link to="/login?next=/merchant">登入</Link>。</p></div>

  return (
    <div className="container page">
      <p className="ab-kicker">Business Center</p>
      <div className="biz-top">
        <div>
          <h1>店家中心</h1>
          <p className="lead" style={{ marginBottom: 0 }}>管理你的刊登、圖片與授權。公開資訊的變更與圖片，都需經 DDF 確認後才會顯示。</p>
        </div>
        <Link to="/list-your-space" className="btn btn-magic">＋ 申請新刊登</Link>
      </div>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      {rows.length === 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <p style={{ marginTop: 0 }}>你還沒有刊登。DDF 只刊登經店家授權的空間資訊，不代表推薦或認證。</p>
          <Link to="/list-your-space" className="btn btn-magic">申請刊登</Link>
        </div>
      )}
      <div className="biz-list">
        {rows.map((s) => (
          <SpaceCard key={s.id} s={s} uid={session.user.id} assets={assets.filter((a) => a.space_id === s.id)} onChanged={load} setMsg={setMsg} />
        ))}
      </div>
      <p style={{ marginTop: 28, fontSize: 13, color: 'var(--muted-2)' }}>設計師個人資料與評價請到 <Link to="/account">會員中心</Link>。</p>
    </div>
  )
}
