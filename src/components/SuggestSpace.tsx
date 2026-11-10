import { useEffect, useState } from 'react'
import { errorText, supabase } from '../lib/supabase'
import { REGIONS } from './ProfilePickers'

type Row = { id: string; name: string; city: string | null; status: string; created_at: string }
const STATUS: Record<string, string> = { new: '已收到', contacted: '洽談中', listed: '已上架 ✦', declined: '店家婉拒' }

/** Members suggest a place; admins then ask the business for authorization. */
export default function SuggestSpace({ empty }: { empty: boolean }) {
  const [f, setF] = useState({ name: '', city: '', link: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [mine, setMine] = useState<Row[]>([])
  const load = () => supabase!.from('space_suggestions').select('id,name,city,status,created_at').order('created_at', { ascending: false }).limit(20).then(({ data }) => setMine((data ?? []) as Row[]))
  useEffect(() => { load() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase!.from('space_suggestions').insert({
      name: f.name.trim(), city: f.city || null, link: f.link.trim() || null, reason: f.reason.trim(),
    })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: /too many suggestions/.test(error.message) ? '今天已推薦 5 家，明天再來推薦吧！' : errorText(error) })
    setF({ name: '', city: '', link: '', reason: '' })
    setMsg({ kind: 'ok', text: '謝謝推薦！我們會聯繫店家取得授權，上架後你就能留下評價。' })
    load()
  }

  return (
    <section className="form card suggest">
      {empty ? (
        <>
          <p className="sec-kicker" style={{ margin: 0 }}>Coming Soon</p>
          <h2 style={{ margin: 0, fontSize: 22 }}>目前還沒有開放評價的空間</h2>
          <p className="lead-s">DDF 只收錄店家授權刊登的空間，所以評價要等空間上架後才能留下。先把你常去、適合工作的地方推薦給我們吧，我們會主動聯繫店家。</p>
        </>
      ) : (
        <>
          <h2 style={{ margin: 0, fontSize: 20 }}>推薦一個空間給 DDF</h2>
          <p className="lead-s">清單上找不到你去過的地方？推薦給我們，我們會聯繫店家取得授權。</p>
        </>
      )}
      <form onSubmit={submit} className="suggest-form">
        <div className="two">
          <label className="field">店名／空間名稱 *<input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例：光合作用咖啡" /></label>
          <label className="field">所在縣市
            <select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
              <option value="">— 請選擇 —</option>
              {REGIONS.filter((r) => r !== '海外').map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <label className="field">店家連結（選填，Google 地圖／IG／官網）<input type="url" pattern="https://.*" maxLength={300} placeholder="https://" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
        <label className="field">為什麼適合設計師工作？ *（10–500 字）
          <textarea required minLength={10} maxLength={500} rows={3} placeholder="例：靠窗那排插座很多，平日下午很安靜，不限時。" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </label>
        <p className="hint" style={{ margin: 0 }}>推薦內容只有管理員看得到，用來聯繫店家；不會公開，也不會直接上架。</p>
        {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
        <button className="btn btn-magic" type="submit" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? '送出中…' : '送出推薦'}</button>
      </form>
      {mine.length > 0 && (
        <div className="suggest-mine">
          <p className="sec-kicker" style={{ margin: '8px 0 6px' }}>My Suggestions</p>
          {mine.map((r) => (
            <p key={r.id} className="suggest-row"><span>{r.name}{r.city && <small> · {r.city}</small>}</span><span className={`st st-${r.status}`}>{STATUS[r.status] ?? r.status}</span></p>
          ))}
        </div>
      )}
    </section>
  )
}
