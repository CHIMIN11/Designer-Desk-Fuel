import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { errorText, supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup' | 'forgot'

export default function Login() {
  const [params] = useSearchParams()
  const { session } = useAuth()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const next = params.get('next') ?? '/'

  if (session) return <Navigate to={next.startsWith('/') ? next : '/'} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMsg(null)
    const origin = window.location.origin
    let error = null
    if (mode === 'signin') {
      ;({ error } = await supabase.auth.signInWithPassword({ email, password }))
    } else if (mode === 'signup') {
      ;({ error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/login`, data: { display_name: displayName } } }))
      if (!error) setMsg({ kind: 'ok', text: '註冊成功！請到信箱點擊驗證連結後再登入。' })
    } else {
      ;({ error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` }))
      if (!error) setMsg({ kind: 'ok', text: '如果這個 Email 有註冊，你會收到重設密碼的信。' })
    }
    if (error) setMsg({ kind: 'error', text: errorText(error) })
    setBusy(false)
  }

  const title = { signin: '登入', signup: '註冊成為魔法師', forgot: '忘記密碼' }[mode]

  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <h1>{title}</h1>
      {!supabase && <p className="notice notice-warn">尚未連接 Supabase，暫時無法登入。</p>}
      <form className="form" onSubmit={submit}>
        <label className="field">Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode === 'signup' && (
          <label className="field">顯示名稱<input required maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：Miko_UI" />
            <span className="hint">會顯示在你的評價上；Email 不會公開。</span>
          </label>
        )}
        {mode !== 'forgot' && (
          <label className="field">密碼
            <input type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'signup' && <span className="hint">至少 8 個字元</span>}
          </label>
        )}
        {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy || !supabase}>{busy ? '處理中…' : title}</button>
        <div className="actions">
          {mode !== 'signin' && <button type="button" className="btn btn-ghost" onClick={() => setMode('signin')}>已有帳號？登入</button>}
          {mode !== 'signup' && <button type="button" className="btn btn-ghost" onClick={() => setMode('signup')}>註冊新帳號</button>}
          {mode !== 'forgot' && <button type="button" className="btn btn-ghost" onClick={() => setMode('forgot')}>忘記密碼</button>}
        </div>
      </form>
    </div>
  )
}
