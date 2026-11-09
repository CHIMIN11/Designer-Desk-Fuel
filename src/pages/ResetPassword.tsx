import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ password })
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: '密碼已更新。' })
  }

  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <h1>設定新密碼</h1>
      <form className="form" onSubmit={submit}>
        <label className="field">新密碼<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
        <button className="btn btn-primary" type="submit" disabled={!supabase}>更新密碼</button>
        {msg?.kind === 'ok' && <Link to="/">回首頁</Link>}
      </form>
    </div>
  )
}
