import { useCallback, useEffect, useState } from 'react'
import ImagePicker from '../../components/ImagePicker'
import { ReviewPhotos } from '../../components/SpaceReviews'
import { formatDate } from '../../lib/labels'
import { errorText, supabase } from '../../lib/supabase'

type Msg = { kind: 'ok' | 'error'; text: string } | null
type BannerRow = { id: string; title: string; subtitle: string | null; image_url: string; link_url: string | null; link_label: string | null; sort_order: number; is_active: boolean; starts_at: string | null; ends_at: string | null }

/** Homepage banner carousel management. */
export function AdminBanners() {
  const [rows, setRows] = useState<BannerRow[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [f, setF] = useState({ title: '', subtitle: '', link_url: '', link_label: '', sort_order: '10', starts_at: '', ends_at: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [editing, setEditing] = useState<BannerRow | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('site_banners').select('*').order('sort_order').order('created_at')
    if (error) setMsg({ kind: 'error', text: errorText(error) })
    setRows((data ?? []) as BannerRow[])
  }, [])
  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files[0]) return setMsg({ kind: 'error', text: '請選擇 Banner 圖片（建議 1920×800 以上，橫式）。' })
    setBusy(true)
    setMsg(null)
    try {
      const file = files[0]
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${crypto.randomUUID()}.${ext}`
      const bucket = supabase!.storage.from('site-banners')
      const up = await bucket.upload(path, file, { contentType: file.type })
      if (up.error) throw up.error
      const { error } = await supabase!.from('site_banners').insert({
        title: f.title, subtitle: f.subtitle || null, image_url: bucket.getPublicUrl(path).data.publicUrl,
        link_url: f.link_url || null, link_label: f.link_label || null, sort_order: Number(f.sort_order) || 0,
        starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
      })
      if (error) throw error
      setMsg({ kind: 'ok', text: '已新增 Banner。' })
      setFiles([])
      setF({ title: '', subtitle: '', link_url: '', link_label: '', sort_order: '10', starts_at: '', ends_at: '' })
      load()
    } catch (err) {
      setMsg({ kind: 'error', text: errorText(err) })
    }
    setBusy(false)
  }

  const update = async (id: string, patch: Partial<BannerRow>) => {
    const { error } = await supabase!.from('site_banners').update(patch).eq('id', id)
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已更新。' })
    load()
  }
  const remove = async (b: BannerRow) => {
    if (!window.confirm(`確定刪除「${b.title}」？`)) return
    const { error } = await supabase!.from('site_banners').delete().eq('id', b.id)
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已刪除。' })
    load()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <div>
      <p className="notice notice-info">首頁第一張固定是品牌主視覺，這裡新增的 Banner 會接在後面輪播（每 7 秒切換）。可設定排程與連結。</p>
      <form className="form admin-form admin-edit" onSubmit={create}>
        <h2 style={{ margin: 0, fontSize: 20 }}>新增 Banner</h2>
        <ImagePicker label="Banner 圖片（橫式，建議 1920×800）" max={1} files={files} onChange={setFiles} />
        <div className="two">
          <label className="field">標題 *<input required maxLength={60} value={f.title} onChange={set('title')} /></label>
          <label className="field">副標<input maxLength={120} value={f.subtitle} onChange={set('subtitle')} /></label>
          <label className="field">按鈕連結（站內 /spaces 或 https://）<input pattern="(https://|/).*" value={f.link_url} onChange={set('link_url')} /></label>
          <label className="field">按鈕文字<input maxLength={20} placeholder="了解更多" value={f.link_label} onChange={set('link_label')} /></label>
          <label className="field">排序（數字小的先）<input type="number" value={f.sort_order} onChange={set('sort_order')} /></label>
          <label className="field">開始時間（選填）<input type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></label>
          <label className="field">結束時間（選填）<input type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></label>
        </div>
        {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
        <button className="btn btn-magic" type="submit" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? '上傳中…' : '新增 Banner'}</button>
      </form>

      {editing && <BannerEdit row={editing} onClose={(changed) => { setEditing(null); if (changed) { setMsg({ kind: 'ok', text: '已更新 Banner。' }); load() } }} />}

      <div className="table-wrap">
        <table>
          <thead><tr><th>圖片</th><th>標題</th><th>排程</th><th>排序</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}>還沒有 Banner。</td></tr>}
            {rows.map((b) => (
              <tr key={b.id}>
                <td><img src={b.image_url} alt="" style={{ width: 120, height: 50, objectFit: 'cover', borderRadius: 6 }} /></td>
                <td><b>{b.title}</b>{b.subtitle && <><br /><small>{b.subtitle}</small></>}{b.link_url && <><br /><small>→ {b.link_url}</small></>}</td>
                <td><small>{b.starts_at ? formatDate(b.starts_at) : '立即'} ～ {b.ends_at ? formatDate(b.ends_at) : '不限'}</small></td>
                <td><input type="number" defaultValue={b.sort_order} style={{ width: 70 }} aria-label="排序" onBlur={(e) => Number(e.target.value) !== b.sort_order && update(b.id, { sort_order: Number(e.target.value) })} /></td>
                <td>{b.is_active ? '顯示中' : '已停用'}</td>
                <td className="actions">
                  <button className="btn btn-primary" type="button" onClick={() => setEditing(b)}>編輯</button>
                  <button className="btn btn-pill-outline" type="button" onClick={() => update(b.id, { is_active: !b.is_active })}>{b.is_active ? '停用' : '啟用'}</button>
                  <button className="btn btn-danger" type="button" onClick={() => remove(b)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** Edit an existing banner: text, link, schedule, order, and optionally replace the image. */
function BannerEdit({ row, onClose }: { row: BannerRow; onClose: (changed: boolean) => void }) {
  const [f, setF] = useState({
    title: row.title, subtitle: row.subtitle ?? '', link_url: row.link_url ?? '', link_label: row.link_label ?? '',
    sort_order: String(row.sort_order), starts_at: toLocal(row.starts_at), ends_at: toLocal(row.ends_at),
  })
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const bucket = supabase!.storage.from('site-banners')
      let image_url = row.image_url
      if (files[0]) {
        const file = files[0]
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
        const path = `${crypto.randomUUID()}.${ext}`
        const up = await bucket.upload(path, file, { contentType: file.type })
        if (up.error) throw up.error
        image_url = bucket.getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase!.from('site_banners').update({
        title: f.title, subtitle: f.subtitle || null, link_url: f.link_url || null, link_label: f.link_label || null,
        sort_order: Number(f.sort_order) || 0, image_url,
        starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
      }).eq('id', row.id)
      if (error) throw error
      if (image_url !== row.image_url) {
        const old = row.image_url.split('/storage/v1/object/public/site-banners/')[1]
        if (old) await bucket.remove([old])
      }
      onClose(true)
    } catch (ex) {
      setErr(errorText(ex))
      setBusy(false)
    }
  }

  return (
    <form className="form admin-form admin-edit card" onSubmit={save} style={{ marginBottom: 20, borderColor: 'var(--gold)' }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>編輯 Banner</h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p className="picker-label" style={{ marginTop: 0 }}>目前圖片</p>
          <img src={row.image_url} alt="" style={{ width: 240, aspectRatio: '12 / 5', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}><ImagePicker label="更換圖片（選填）" max={1} files={files} onChange={setFiles} /></div>
      </div>
      <div className="two">
        <label className="field">標題 *<input required maxLength={60} value={f.title} onChange={set('title')} /></label>
        <label className="field">副標<input maxLength={120} value={f.subtitle} onChange={set('subtitle')} /></label>
        <label className="field">按鈕連結（站內 /spaces 或 https://）<input pattern="(https://|/).*" value={f.link_url} onChange={set('link_url')} /></label>
        <label className="field">按鈕文字<input maxLength={20} placeholder="了解更多" value={f.link_label} onChange={set('link_label')} /></label>
        <label className="field">排序（數字小的先）<input type="number" value={f.sort_order} onChange={set('sort_order')} /></label>
        <label className="field">開始時間（選填）<input type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></label>
        <label className="field">結束時間（選填）<input type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></label>
      </div>
      {err && <p className="notice notice-error" role="alert">{err}</p>}
      <div className="actions">
        <button className="btn btn-magic" type="submit" disabled={busy}>{busy ? '儲存中…' : '儲存修改'}</button>
        <button className="btn btn-pill-outline" type="button" onClick={() => onClose(false)}>取消</button>
      </div>
    </form>
  )
}

type ReportRow = { id: string; message_id: string; report_type: string; description: string | null; status: string; created_at: string }
type MsgRow = { id: string; body: string; sender_id: string; deleted_at: string | null }

/** Chat report handling: view the reported message (minimum necessary), delete or dismiss. */
export function AdminChatReports() {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [messages, setMessages] = useState<Record<string, MsgRow>>({})
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const { data } = await supabase!.from('chat_reports').select('*').order('created_at', { ascending: false }).limit(200)
    const rows = (data ?? []) as ReportRow[]
    setReports(rows)
    const ids = [...new Set(rows.map((r) => r.message_id))]
    if (ids.length) {
      const { data: m } = await supabase!.from('chat_messages').select('id,body,sender_id,deleted_at').in('id', ids)
      setMessages(Object.fromEntries(((m ?? []) as MsgRow[]).map((x) => [x.id, x])))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const del = async (r: ReportRow) => {
    const reason = window.prompt('刪除原因（會寫入稽核紀錄）')
    if (!reason) return
    const { error } = await supabase!.rpc('delete_chat_message', { p_message_id: r.message_id, p_reason: reason })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已刪除訊息，相關檢舉已結案。' })
    load()
  }
  const dismiss = async (r: ReportRow) => {
    const reason = window.prompt('不成立的原因')
    if (!reason) return
    const { error } = await supabase!.rpc('admin_dismiss_report', { p_report_id: r.id, p_reason: reason })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已標記為不成立。' })
    load()
  }

  return (
    <div>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>時間</th><th>類別</th><th>被檢舉訊息</th><th>說明</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>
            {reports.length === 0 && <tr><td colSpan={6}>沒有檢舉案件。</td></tr>}
            {reports.map((r) => {
              const m = messages[r.message_id]
              return (
                <tr key={r.id}>
                  <td>{formatDate(r.created_at)}</td>
                  <td>{r.report_type}</td>
                  <td style={{ maxWidth: 360 }}>{m ? (m.deleted_at ? <s>{m.body}</s> : m.body) : '—'}</td>
                  <td>{r.description ?? '—'}</td>
                  <td>{r.status === 'pending' ? '待處理' : r.status === 'resolved' ? '已處理' : '不成立'}</td>
                  <td className="actions">
                    {r.status === 'pending' && <>
                      <button className="btn btn-danger" type="button" onClick={() => del(r)}>刪除訊息</button>
                      <button className="btn btn-pill-outline" type="button" onClick={() => dismiss(r)}>不成立</button>
                    </>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 10 }}>依最小必要原則，只顯示被檢舉的單則訊息。</p>
    </div>
  )
}

type Inquiry = { id: string; plan: string; name: string; company: string | null; email: string; phone: string | null; message: string; status: string; admin_note: string | null; created_at: string }
export const PLAN_LABELS: Record<string, string> = {
  space_listing: '空間刊登', brand_sponsor: '品牌贊助', event: '活動與講座合作', tool: '設計工具合作', media: '媒體／社群合作', other: '其他',
}

/** Partnership inquiries from /contact. Contact details are shown only here, to admins. */
export function AdminInquiries() {
  const [rows, setRows] = useState<Inquiry[]>([])
  const [filter, setFilter] = useState('new')
  const [msg, setMsg] = useState<Msg>(null)
  const load = useCallback(async () => {
    let q = supabase!.from('contact_inquiries').select('*').order('created_at', { ascending: false }).limit(300)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data, error } = await q
    if (error) setMsg({ kind: 'error', text: errorText(error) })
    setRows((data ?? []) as Inquiry[])
  }, [filter])
  useEffect(() => { load() }, [load])

  const setStatus = async (r: Inquiry, status: string) => {
    const note = status === 'closed' ? window.prompt('結案備註（選填）', r.admin_note ?? '') : r.admin_note
    const { error } = await supabase!.from('contact_inquiries').update({ status, admin_note: note || null }).eq('id', r.id)
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已更新狀態。' })
    load()
  }

  return (
    <div>
      <div className="actions" style={{ marginBottom: 14 }}>
        {[['new', '新進'], ['replied', '已回覆'], ['closed', '已結案'], ['all', '全部']].map(([v, l]) => (
          <button key={v} type="button" className={`btn ${filter === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      {rows.length === 0 && <p className="card">沒有洽詢。</p>}
      <div className="inq-list">
        {rows.map((r) => (
          <article key={r.id} className="card inq">
            <p className="inq-meta"><span className="badge badge-muted">{PLAN_LABELS[r.plan] ?? r.plan}</span> {formatDate(r.created_at)} · {r.status === 'new' ? '新進' : r.status === 'replied' ? '已回覆' : '已結案'}</p>
            <h3>{r.name}{r.company && <small> · {r.company}</small>}</h3>
            <p className="inq-contact"><a href={`mailto:${r.email}?subject=${encodeURIComponent('DDF 合作洽詢回覆')}`}>{r.email}</a>{r.phone && <> · {r.phone}</>}</p>
            <p className="inq-body">{r.message}</p>
            {r.admin_note && <p className="hint">備註：{r.admin_note}</p>}
            <div className="actions">
              {r.status !== 'replied' && <button type="button" className="btn btn-pill-outline" onClick={() => setStatus(r, 'replied')}>標記已回覆</button>}
              {r.status !== 'closed' && <button type="button" className="btn btn-pill-outline" onClick={() => setStatus(r, 'closed')}>結案</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

type Suggestion = { id: string; name: string; city: string | null; link: string | null; reason: string; status: string; admin_note: string | null; created_at: string }
const SUG_STATUS: Record<string, string> = { new: '新推薦', contacted: '洽談中', listed: '已上架', declined: '店家婉拒' }

/** Member suggestions: leads to contact businesses for authorization. Never auto-published. */
export function AdminSuggestions({ onConvert }: { onConvert: (p: { suggestionId: string; name: string; city: string | null; link: string | null; reason: string }) => void }) {
  const [rows, setRows] = useState<Suggestion[]>([])
  const [edit, setEdit] = useState<Suggestion | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('space_suggestions').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) setMsg({ kind: 'error', text: errorText(error) })
    setRows((data ?? []) as Suggestion[])
  }, [])
  useEffect(() => { load() }, [load])
  const set = async (r: Suggestion, status: string) => {
    const note = window.prompt('備註（選填，例如聯繫方式、店家回覆）', r.admin_note ?? '')
    if (note === null) return
    const { error } = await supabase!.from('space_suggestions').update({ status, admin_note: note || null }).eq('id', r.id)
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已更新。' })
    load()
  }
  return (
    <div>
      <p className="notice notice-info">會員推薦的空間只是聯繫名單，不會自動上架。取得店家同意後按「建立空間並上架」，資料會自動帶入；填好授權證明送出就會直接上架，並把這筆推薦標成「已上架」。</p>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      {rows.length === 0 && <p className="card">還沒有會員推薦。</p>}
      <div className="inq-list">
        {rows.map((r) => (
          <article key={r.id} className="card inq">
            <p className="inq-meta"><span className="badge badge-muted">{SUG_STATUS[r.status]}</span> {formatDate(r.created_at)}{r.city && ` · ${r.city}`}</p>
            <h3>{r.name}</h3>
            {r.link && <p className="inq-contact"><a href={r.link} target="_blank" rel="noopener noreferrer">{r.link}</a></p>}
            <p className="inq-body">{r.reason}</p>
            {r.admin_note && <p className="hint">備註：{r.admin_note}</p>}
            {edit?.id === r.id && (
              <form className="form" style={{ marginBottom: 12 }} onSubmit={async (e) => {
                e.preventDefault()
                const { error } = await supabase!.from('space_suggestions').update({ name: edit.name, city: edit.city || null, link: edit.link || null, reason: edit.reason }).eq('id', r.id)
                setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已儲存修改。' })
                if (!error) { setEdit(null); load() }
              }}>
                <div className="two">
                  <label className="field">店名<input required maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
                  <label className="field">縣市<input maxLength={20} value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></label>
                </div>
                <label className="field">連結<input type="url" pattern="https://.*" maxLength={300} value={edit.link ?? ''} onChange={(e) => setEdit({ ...edit, link: e.target.value })} /></label>
                <label className="field">推薦原因<textarea required minLength={10} maxLength={500} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></label>
                <div className="actions"><button className="btn btn-magic" type="submit">儲存</button><button className="btn btn-pill-outline" type="button" onClick={() => setEdit(null)}>取消</button></div>
              </form>
            )}
            <div className="actions">
              <button type="button" className="btn btn-magic" onClick={() => onConvert({ suggestionId: r.id, name: r.name, city: r.city, link: r.link, reason: r.reason })}>建立空間並上架 →</button>
              <button type="button" className="btn btn-pill-outline" onClick={() => setEdit(r)}>編輯</button>
              {['contacted', 'listed', 'declined'].filter((s) => s !== r.status).map((s) => (
                <button key={s} type="button" className="btn btn-pill-outline" onClick={() => set(r, s)}>標記{SUG_STATUS[s]}</button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

type AdminNote = { id: string; place_name: string; city: string | null; district: string | null; map_link: string | null; body: string; photo_urls: string[]; status: string; created_at: string }

/** Moderate member pocket picks; optionally turn one into a listing after the business agrees. */
export function AdminNotes({ onConvert }: { onConvert: (p: { suggestionId: string; name: string; city: string | null; link: string | null; reason: string }) => void }) {
  const [rows, setRows] = useState<AdminNote[]>([])
  const [msg, setMsg] = useState<Msg>(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('place_notes').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) setMsg({ kind: 'error', text: errorText(error) })
    setRows((data ?? []) as AdminNote[])
  }, [])
  useEffect(() => { load() }, [load])
  const setStatus = async (n: AdminNote, status: string) => {
    const reason = status === 'hidden' ? window.prompt('隱藏原因（例：店家要求移除、內容不實）') : '恢復顯示'
    if (!reason) return
    const { error } = await supabase!.rpc('admin_set_note_status', { p_note_id: n.id, p_status: status, p_reason: reason })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '已更新。' })
    load()
  }
  return (
    <div>
      <p className="notice notice-info">會員分享的私房據點是個人心得，不需店家授權，公開時會標示「會員親身心得・非店家刊登資訊」。店家要求移除或內容不實時請隱藏。若店家同意正式刊登，可按「建立空間並上架」。</p>
      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      {rows.length === 0 && <p className="card">還沒有私房據點。</p>}
      <div className="inq-list">
        {rows.map((n) => (
          <article key={n.id} className="card inq">
            <p className="inq-meta"><span className="badge badge-muted">{n.status === 'visible' ? '公開中' : '已隱藏'}</span> {formatDate(n.created_at)}{n.city && ` · ${n.city}`}{n.district && ` ${n.district}`}</p>
            <h3>{n.place_name}</h3>
            {n.map_link && <p className="inq-contact"><a href={n.map_link} target="_blank" rel="noopener noreferrer">{n.map_link}</a></p>}
            <p className="inq-body">{n.body}</p>
            {n.photo_urls.length > 0 && <ReviewPhotos urls={n.photo_urls} />}
            <div className="actions">
              <button type="button" className="btn btn-pill-outline" onClick={() => onConvert({ suggestionId: '', name: n.place_name, city: n.city, link: n.map_link, reason: n.body })}>建立空間並上架 →</button>
              {n.status === 'visible'
                ? <button type="button" className="btn btn-danger" onClick={() => setStatus(n, 'hidden')}>隱藏</button>
                : <button type="button" className="btn btn-pill-outline" onClick={() => setStatus(n, 'visible')}>恢復顯示</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
