import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { AUTH_STATUS, CATEGORY, PUB_STATUS, formatDate } from '../lib/labels'
import { errorText, supabase } from '../lib/supabase'

type MySpace = {
  id: string
  business_name: string
  category: string
  city: string
  opening_hours: string | null
  seating_information: string | null
  authorization_status: string
  publication_status: string
  last_verified_at: string | null
  next_review_at: string | null
}

export default function MySpaces() {
  const { session } = useAuth()
  const [rows, setRows] = useState<MySpace[]>([])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [hours, setHours] = useState('')
  const [seating, setSeating] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !session) return
    // RLS returns only spaces this account manages.
    const { data, error } = await supabase
      .from('spaces')
      .select('id,business_name,category,city,opening_hours,seating_information,authorization_status,publication_status,last_verified_at,next_review_at')
      .order('created_at', { ascending: false })
    if (error) setMsg({ kind: 'error', text: errorText(error) })
    else setRows(data as MySpace[])
  }, [session])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'pause' | 'withdraw') => {
    const label = action === 'pause' ? '暫停刊登' : '撤回授權（所有素材授權也會一併撤回）'
    if (!window.confirm(`確定要${label}嗎？`)) return
    const { error } = await supabase!.rpc('merchant_set_listing', { p_space_id: id, p_action: action, p_reason: null })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: action === 'pause' ? '已暫停刊登。' : '已撤回授權，空間已從公開目錄移除。' })
    load()
  }

  const requestUpdate = async (s: MySpace) => {
    const changes: Record<string, string> = {}
    if (hours !== (s.opening_hours ?? '')) changes.opening_hours = hours
    if (seating !== (s.seating_information ?? '')) changes.seating_information = seating
    if (Object.keys(changes).length === 0) return setMsg({ kind: 'error', text: '沒有變更內容。' })
    const { error } = await supabase!.rpc('request_space_update', { p_space_id: s.id, p_changes: changes })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已送出更新申請，管理員審核後才會更新公開資訊。' })
    setEditing(null)
  }

  if (!supabase) return <div className="container page"><p className="notice notice-warn">尚未連接 Supabase。</p></div>
  if (!session) return <div className="container page"><p>請先 <Link to="/login?next=/my-spaces">登入</Link>。</p></div>

  return (
    <div className="container page">
      <h1>我的刊登</h1>
      <p className="lead">查看申請進度、申請更新資料，或暫停、撤回刊登。公開資訊的變更需經管理員審核。</p>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      {rows.length === 0 && <div className="card">你還沒有刊登申請。<Link to="/list-your-space">申請刊登 →</Link></div>}
      <div className="grid-cards">
        {rows.map((s) => (
          <article key={s.id} className="card">
            <h2 style={{ margin: 0, fontSize: 19 }}>{s.business_name}</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-2)' }}>{CATEGORY[s.category]} · {s.city}</p>
            <dl className="facts">
              <div><dt>授權狀態</dt><dd>{AUTH_STATUS[s.authorization_status]}</dd></div>
              <div><dt>刊登狀態</dt><dd>{PUB_STATUS[s.publication_status]}</dd></div>
              <div><dt>最後確認</dt><dd>{formatDate(s.last_verified_at)}</dd></div>
              <div><dt>下次複查</dt><dd>{formatDate(s.next_review_at)}</dd></div>
            </dl>
            {editing === s.id ? (
              <div className="form" style={{ marginTop: 14 }}>
                <label className="field">營業時間<textarea value={hours} onChange={(e) => setHours(e.target.value)} maxLength={500} /></label>
                <label className="field">座位與場地資訊<textarea value={seating} onChange={(e) => setSeating(e.target.value)} maxLength={500} /></label>
                <div className="actions">
                  <button className="btn btn-primary" type="button" onClick={() => requestUpdate(s)}>送出更新申請</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>取消</button>
                </div>
              </div>
            ) : (
              <div className="actions" style={{ marginTop: 14 }}>
                {s.authorization_status !== 'withdrawn' && (
                  <button className="btn btn-ghost" type="button" onClick={() => { setEditing(s.id); setHours(s.opening_hours ?? ''); setSeating(s.seating_information ?? '') }}>申請更新資料</button>
                )}
                {s.publication_status === 'published' && <button className="btn btn-ghost" type="button" onClick={() => act(s.id, 'pause')}>暫停刊登</button>}
                {s.authorization_status !== 'withdrawn' && <button className="btn btn-danger" type="button" onClick={() => act(s.id, 'withdraw')}>撤回授權</button>}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
