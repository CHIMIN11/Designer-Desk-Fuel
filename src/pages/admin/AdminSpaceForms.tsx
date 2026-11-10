import { useState } from 'react'
import SpaceFields, { changedKeys, emptyDraft, toDraft, toPayload, type SpaceDraft } from '../../components/SpaceFields'
import { errorText, supabase } from '../../lib/supabase'

const oneYear = () => new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)

type Msg = { kind: 'ok' | 'error'; text: string } | null

/** Admin enters a listing on behalf of a business that authorised DDF (e.g. by email). */
export type SpacePrefill = { suggestionId: string; name: string; city: string | null; link: string | null; reason: string }

const CITY_MAP: Record<string, string> = { 臺北市: '台北市', 臺中市: '台中市' }

function draftFrom(p?: SpacePrefill | null): SpaceDraft {
  const d = emptyDraft()
  if (!p) return d
  d.business_name = p.name
  if (p.city) d.city = CITY_MAP[p.city] ?? p.city
  if (p.link) {
    if (/instagram|facebook|threads|line\.me/i.test(p.link)) d.official_social_url = p.link
    else if (!/google\.[^/]+\/maps|goo\.gl|maps\.app/i.test(p.link)) d.official_website = p.link
  }
  return d
}

export function AdminCreateSpace({ onDone, prefill }: { onDone: () => void; prefill?: SpacePrefill | null }) {
  const [draft, setDraft] = useState<SpaceDraft>(() => draftFrom(prefill))
  const [publishNow, setPublishNow] = useState(true)
  const [auth, setAuth] = useState({
    applicant_name: '', applicant_position: '', applicant_email: '', evidence_reference: '', expires_at: oneYear(), owner_email: '',
  })
  const [scope, setScope] = useState({ photos: false, logo: false, official_text: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const a = (k: keyof typeof auth) => (e: React.ChangeEvent<HTMLInputElement>) => setAuth({ ...auth, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data: newId, error } = await supabase!.rpc('admin_create_space', {
      p_space: toPayload(draft),
      p_authorization: {
        applicant_name: auth.applicant_name, applicant_position: auth.applicant_position, applicant_email: auth.applicant_email,
        evidence_reference: auth.evidence_reference, expires_at: auth.evidence_reference ? new Date(auth.expires_at).toISOString() : null,
        scope, terms_version: 'admin-entered',
      },
      p_owner_email: auth.owner_email || null,
    })
    setBusy(false)
    if (error) {
      setMsg({ kind: 'error', text: /no member account/.test(error.message) ? '找不到使用這個 Email 的會員帳號。' : errorText(error) })
      return
    }
    let text = auth.evidence_reference ? '已建立並核准授權。下一步：到「上架管理」核對資料後上架。' : '已建立，授權狀態為審核中（未填授權證明）。'
    if (auth.evidence_reference && publishNow && newId) {
      const next = new Date(Date.now() + 90 * 86400000).toISOString()
      const v = await supabase!.rpc('admin_verify_space', { p_space_id: newId, p_next_review_at: next, p_note: '管理員建立時核對' })
      const p = v.error ? v : await supabase!.rpc('admin_set_publication', { p_space_id: newId, p_status: 'published', p_reason: '管理員建立並上架' })
      text = p.error ? `已建立並核准授權，但自動上架失敗：${errorText(p.error)}。請到「上架管理」處理。` : '✦ 已建立、核對並上架！到「探索空間」就能看到，會員也能開始寫評價了。'
    }
    if (prefill?.suggestionId) {
      await supabase!.from('space_suggestions').update({ status: 'listed', admin_note: `已建立空間 ${draft.business_name}` }).eq('id', prefill.suggestionId)
    }
    setMsg({ kind: 'ok', text })
    setDraft(emptyDraft())
    setAuth({ ...auth, applicant_name: '', applicant_position: '', applicant_email: '', evidence_reference: '', owner_email: '' })
    onDone()
  }

  return (
    <form className="form admin-form" onSubmit={submit}>
      <p className="notice notice-info" style={{ margin: 0 }}>
        用於店家已透過 Email、電話或當面授權，由管理員代為建立資料。授權證明與到期日都填寫時會直接核准授權；仍需「核對資料」後才能上架。
      </p>
      {prefill && <p className="notice notice-ok" style={{ margin: 0 }}>由會員推薦帶入：{prefill.name}。推薦原因：「{prefill.reason}」（僅供參考，不會公開）</p>}
      <SpaceFields value={draft} onChange={setDraft} />
      <fieldset>
        <legend>授權資料</legend>
        <div className="two">
          <label className="field">店家聯絡人 *<input required maxLength={80} value={auth.applicant_name} onChange={a('applicant_name')} /></label>
          <label className="field">職稱 *<input required maxLength={80} value={auth.applicant_position} onChange={a('applicant_position')} /></label>
          <label className="field">聯絡人 Email *<input required type="email" value={auth.applicant_email} onChange={a('applicant_email')} /></label>
          <label className="field">指派給店家會員帳號（選填，填會員 Email）<input type="email" value={auth.owner_email} onChange={a('owner_email')} /><span className="hint">指派後店家可在「我的刊登」管理這筆資料</span></label>
          <label className="field">授權證明（例：2026-11-10 官方 Email 確認）<input maxLength={300} value={auth.evidence_reference} onChange={a('evidence_reference')} /></label>
          <label className="field">授權到期日<input type="date" value={auth.expires_at} onChange={a('expires_at')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={scope.photos} onChange={(e) => setScope({ ...scope, photos: e.target.checked })} /> 照片使用授權</label>
        <label className="check"><input type="checkbox" checked={scope.logo} onChange={(e) => setScope({ ...scope, logo: e.target.checked })} /> Logo 使用授權</label>
        <label className="check"><input type="checkbox" checked={scope.official_text} onChange={(e) => setScope({ ...scope, official_text: e.target.checked })} /> 官方文字介紹使用授權</label>
      </fieldset>
      <label className="check"><input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} /> 填了授權證明時，建立後直接核對並上架（下次複查：90 天後）</label>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      <button className="btn btn-magic" type="submit" disabled={busy} style={{ justifySelf: 'start', minHeight: 48 }}>{busy ? '建立中…' : publishNow && auth.evidence_reference ? '建立並上架' : '建立空間'}</button>
    </form>
  )
}

/** Admin edits an existing listing; only changed fields are sent, with a reason. */
export function AdminEditSpace({ row, onClose }: { row: Record<string, unknown>; onClose: (changed: boolean) => void }) {
  const [original] = useState<SpaceDraft>(() => toDraft(row))
  const [draft, setDraft] = useState<SpaceDraft>(() => toDraft(row))
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const changed = changedKeys(original, draft)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (changed.length === 0) return setMsg({ kind: 'error', text: '沒有變更內容。' })
    const { error } = await supabase!.rpc('admin_update_space', { p_space_id: row.id, p_changes: toPayload(draft, changed), p_reason: reason })
    if (error) return setMsg({ kind: 'error', text: errorText(error) })
    onClose(true)
  }

  return (
    <form className="form admin-form admin-edit" onSubmit={save}>
      <h2 style={{ margin: 0, fontSize: 20 }}>編輯：{String(row.business_name)}</h2>
      <SpaceFields value={draft} onChange={setDraft} />
      <label className="field">修改原因 *（會寫入稽核紀錄）<input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：店家來信更新營業時間" /></label>
      {msg && <p className="notice notice-error" role="alert">{msg.text}</p>}
      <div className="actions">
        <button className="btn btn-magic" type="submit">儲存變更（{changed.length} 項）</button>
        <button className="btn btn-pill-outline" type="button" onClick={() => onClose(false)}>取消</button>
      </div>
    </form>
  )
}
