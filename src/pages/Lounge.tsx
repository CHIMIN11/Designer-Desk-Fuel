import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { useAuth } from '../lib/auth'
import { errorText, supabase } from '../lib/supabase'

type Channel = { id: string; slug: string; name: string; description: string | null }
type Message = { id: string; channel_id: string; sender_id: string; body: string; created_at: string; deleted_at: string | null }
type Who = { display_name: string; avatar_url: string | null }

const REPORT_TYPES: Record<string, string> = {
  spam: 'Spam／廣告洗版', harassment: 'Harassment／騷擾', scam: 'Scam／詐騙', impersonation: 'Impersonation／冒充他人',
  copyright: 'Copyright／著作權侵害', privacy: 'Privacy／隱私侵犯', other: 'Other／其他',
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
const day = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })

export default function Lounge() {
  const { session, isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [names, setNames] = useState<Record<string, Who>>({})
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const [reporting, setReporting] = useState<Message | null>(null)
  const [reportType, setReportType] = useState('spam')
  const [reportNote, setReportNote] = useState('')
  const [notice, setNotice] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const uid = session?.user.id
  const current = channels.find((c) => c.slug === params.get('c')) ?? channels[0]

  useEffect(() => {
    if (!supabase || !session) return
    supabase.from('chat_channels').select('id,slug,name,description').order('sort_order').then(({ data }) => setChannels((data ?? []) as Channel[]))
  }, [session])

  const resolveNames = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => !names[id])
    if (!missing.length) return
    const { data } = await supabase!.rpc('chat_display_names', { p_ids: missing })
    setNames((prev) => {
      const next = { ...prev }
      for (const r of (data ?? []) as { id: string; display_name: string; avatar_url: string | null }[]) next[r.id] = r
      return next
    })
  }, [names])

  const load = useCallback(async () => {
    if (!current) return
    const { data } = await supabase!.from('chat_messages').select('id,channel_id,sender_id,body,created_at,deleted_at')
      .eq('channel_id', current.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(80)
    const rows = ((data ?? []) as Message[]).reverse()
    setMessages(rows)
    resolveNames(rows.map((m) => m.sender_id))
  }, [current, resolveNames])

  // Initial load + realtime inserts for the open channel; light refresh drops deleted messages.
  useEffect(() => {
    if (!current) return
    load()
    const ch = supabase!.channel(`lounge-${current.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${current.id}` }, (payload) => {
        const m = payload.new as Message
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        resolveNames([m.sender_id])
      })
      .subscribe()
    const t = setInterval(load, 30000)
    return () => { supabase!.removeChannel(ch); clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [messages.length])

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || !current || sending) return
    setSending(true)
    setErr('')
    const { data, error } = await supabase!.from('chat_messages').insert({ channel_id: current.id, sender_id: uid, body }).select('id,channel_id,sender_id,body,created_at,deleted_at').single()
    setSending(false)
    if (error) {
      setErr(/sending too fast/.test(error.message) ? '傳太快了，請稍候幾秒再試。' : /duplicate message/.test(error.message) ? '請勿重複發送相同訊息。' : errorText(error))
      return
    }
    setText('')
    setMessages((prev) => (prev.some((x) => x.id === (data as Message).id) ? prev : [...prev, data as Message]))
  }

  const remove = async (m: Message) => {
    const mine = m.sender_id === uid
    const reason = mine ? null : window.prompt('刪除原因（會寫入稽核紀錄）')
    if (!mine && !reason) return
    if (mine && !window.confirm('確定要刪除這則訊息嗎？')) return
    const { error } = await supabase!.rpc('delete_chat_message', { p_message_id: m.id, p_reason: reason })
    if (error) return setErr(errorText(error))
    setMessages((prev) => prev.filter((x) => x.id !== m.id))
  }

  const report = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reporting) return
    const { error } = await supabase!.from('chat_reports').insert({ message_id: reporting.id, reporter_id: uid, report_type: reportType, description: reportNote || null })
    setReporting(null)
    setReportNote('')
    setNotice(error ? (/duplicate key/.test(error.message) ? '你已檢舉過這則訊息。' : errorText(error)) : '已收到檢舉，管理員會盡快處理。')
  }

  if (!supabase) return <div className="container page"><p className="notice notice-warn">尚未連接 Supabase。</p></div>
  if (!session) {
    return (
      <div className="container page">
        <p className="ab-kicker">DDF Lounge</p>
        <h1>DDF 即時聊天室</h1>
        <p className="lead">會員專屬的設計師聊天室：工作空間分享、設計討論、合作與活動資訊。登入後即可加入。</p>
        <Link to="/login?next=/lounge" className="btn btn-magic">登入／註冊</Link>
      </div>
    )
  }

  return (
    <div className="container page lounge-page">
      <div className="lounge">
        <nav className="lounge-ch" aria-label="聊天頻道">
          <p className="h">頻道</p>
          {channels.map((c) => (
            <button key={c.id} type="button" className={current?.id === c.id ? 'on' : ''} onClick={() => setParams({ c: c.slug })}># {c.name}</button>
          ))}
        </nav>
        <section className="lounge-main" aria-label={current ? `# ${current.name}` : '聊天'}>
          <header className="lounge-head">
            <div>
              <h1># {current?.name ?? '…'}</h1>
              {current?.description && <p>{current.description}</p>}
            </div>
            <span className="badge badge-muted">會員限定</span>
          </header>
          <div className="lounge-list" ref={listRef} aria-live="polite">
            {messages.length === 0 && <p className="lounge-empty">還沒有訊息，來打聲招呼吧！</p>}
            {messages.map((m, k) => {
              const who = names[m.sender_id]
              const newDay = k === 0 || day(messages[k - 1].created_at) !== day(m.created_at)
              return (
                <div key={m.id}>
                  {newDay && <p className="lounge-day"><span>{day(m.created_at)}</span></p>}
                  <div className={`lounge-msg${m.sender_id === uid ? ' mine' : ''}`}>
                    {who?.avatar_url ? <img className="av" src={who.avatar_url} alt="" /> : <span className="av" aria-hidden="true">{(who?.display_name ?? '會').slice(0, 1)}</span>}
                    <div className="bubble-wrap">
                      <p className="who"><b>{who?.display_name ?? 'DDF 會員'}</b> <time dateTime={m.created_at}>{time(m.created_at)}</time>
                        <span className="msg-actions">
                          {(m.sender_id === uid || isAdmin) && <button type="button" onClick={() => remove(m)}>刪除</button>}
                          {m.sender_id !== uid && <button type="button" onClick={() => { setReporting(m); setNotice('') }}>檢舉</button>}
                        </span>
                      </p>
                      <p className="bubble">{m.body}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {notice && <p className="notice notice-ok" role="status" style={{ margin: '8px 16px 0' }}>{notice}</p>}
          {reporting && (
            <form className="lounge-report" onSubmit={report}>
              <p style={{ margin: 0 }}>檢舉訊息：「{reporting.body.slice(0, 40)}{reporting.body.length > 40 ? '…' : ''}」</p>
              <label className="field">檢舉類別
                <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
                  {Object.entries(REPORT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field">補充說明（選填）<input maxLength={500} value={reportNote} onChange={(e) => setReportNote(e.target.value)} /></label>
              <div className="actions">
                <button type="submit" className="btn btn-magic">送出檢舉</button>
                <button type="button" className="btn btn-pill-outline" onClick={() => setReporting(null)}>取消</button>
              </div>
            </form>
          )}
          <form className="lounge-input" onSubmit={send}>
            <label className="sr-only" htmlFor="lounge-text">輸入訊息</label>
            <textarea id="lounge-text" rows={1} maxLength={500} placeholder={`傳訊息到 # ${current?.name ?? ''}（Enter 送出，Shift＋Enter 換行）`}
              value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
            <button type="submit" className="send" aria-label="送出" disabled={!text.trim() || sending}><Icon name="arrow" size={20} stroke={2.2} /></button>
          </form>
          {err && <p className="notice notice-error" role="alert" style={{ margin: '0 16px 12px' }}>{err}</p>}
          <p className="lounge-foot">{text.length}/500 · 請遵守 <Link to="/community-guidelines">社群守則</Link>。聊天內容不會被用於廣告或品牌分析。</p>
        </section>
      </div>
    </div>
  )
}
