import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../../lib/labels'
import { errorText, supabase } from '../../lib/supabase'
import { MEMBER_TYPE, VISIBILITY } from '../Account'

type Profile = {
  id: string; display_name: string | null; username: string | null; member_type: string; profession: string | null
  bio: string | null; location: string | null; skills: string[]; portfolio_url: string | null; avatar_url: string | null
  profile_visibility: string; show_portfolio: boolean; created_at: string
}

const EDITABLE = ['display_name', 'username', 'member_type', 'profession', 'location', 'bio', 'portfolio_url', 'profile_visibility'] as const

export default function AdminMembers() {
  const [rows, setRows] = useState<Profile[]>([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [skills, setSkills] = useState('')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('profiles').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) setMsg({ kind: 'error', text: errorText(error) })
    else setRows(data as Profile[])
  }, [])
  useEffect(() => { load() }, [load])

  const open = (p: Profile) => {
    setEditing(p)
    setDraft(Object.fromEntries(EDITABLE.map((k) => [k, (p[k] as string | null) ?? ''])))
    setSkills(p.skills.join(', '))
    setReason('')
    setMsg(null)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const changes: Record<string, unknown> = {}
    for (const k of EDITABLE) if ((editing[k] ?? '') !== draft[k]) changes[k] = draft[k]
    const newSkills = skills.split(',').map((s) => s.trim()).filter(Boolean)
    if (newSkills.join(',') !== editing.skills.join(',')) changes.skills = newSkills
    if (Object.keys(changes).length === 0) return setMsg({ kind: 'error', text: '沒有變更內容。' })
    const { error } = await supabase!.rpc('admin_update_profile', { p_user_id: editing.id, p_changes: changes, p_reason: reason })
    if (error) return setMsg({ kind: 'error', text: errorText(error) })
    setMsg({ kind: 'ok', text: '已更新會員資料並寫入稽核紀錄。' })
    setEditing(null)
    load()
  }

  const shown = rows.filter((p) => {
    if (!q) return true
    const hay = [p.display_name, p.username, p.profession, p.location, ...p.skills].join(' ').toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  return (
    <div>
      <div className="filters">
        <label className="field" style={{ flex: '1 1 260px' }}>搜尋會員（名稱、帳號、職業、地區、技能）
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span style={{ color: 'var(--muted-2)', fontSize: 13 }}>共 {shown.length} 位</span>
      </div>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}

      {editing && (
        <form className="form admin-form admin-edit" onSubmit={save}>
          <h2 style={{ margin: 0, fontSize: 20 }}>編輯會員：{editing.display_name ?? '（未命名）'}</h2>
          <div className="two">
            <label className="field">顯示名稱<input maxLength={60} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></label>
            <label className="field">帳號代稱（小寫英數與底線）<input pattern="[a-z0-9_]{3,30}" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></label>
            <label className="field">身分
              <select value={draft.member_type} onChange={(e) => setDraft({ ...draft, member_type: e.target.value })}>
                {Object.entries(MEMBER_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">公開程度
              <select value={draft.profile_visibility} onChange={(e) => setDraft({ ...draft, profile_visibility: e.target.value })}>
                {Object.entries(VISIBILITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">職業／專長<input maxLength={60} value={draft.profession} onChange={(e) => setDraft({ ...draft, profession: e.target.value })} /></label>
            <label className="field">地區<input maxLength={40} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
            <label className="field">作品集網址<input type="url" pattern="https://.*" value={draft.portfolio_url} onChange={(e) => setDraft({ ...draft, portfolio_url: e.target.value })} /></label>
            <label className="field">技能（以逗號分隔）<input value={skills} onChange={(e) => setSkills(e.target.value)} /></label>
          </div>
          <label className="field">簡介<textarea maxLength={500} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} /></label>
          <label className="field">修改原因 *（會寫入稽核紀錄）<input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="actions">
            <button className="btn btn-magic" type="submit">儲存</button>
            <button className="btn btn-pill-outline" type="button" onClick={() => setEditing(null)}>取消</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>會員</th><th>身分</th><th>職業／地區</th><th>公開程度</th><th>加入</th><th>操作</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6}>沒有符合的會員。</td></tr>}
            {shown.map((p) => (
              <tr key={p.id}>
                <td><b>{p.display_name ?? '（未命名）'}</b>{p.username && <><br /><small>@{p.username}</small></>}</td>
                <td>{MEMBER_TYPE[p.member_type] ?? p.member_type}</td>
                <td>{p.profession ?? '—'}<br /><small>{p.location ?? ''}</small></td>
                <td>{VISIBILITY[p.profile_visibility]}</td>
                <td>{formatDate(p.created_at)}</td>
                <td><button className="btn btn-pill-outline" type="button" onClick={() => open(p)}>編輯</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 10 }}>會員 Email 與密碼不在這裡顯示或修改；如需協助請到 Supabase → Authentication。</p>
    </div>
  )
}
