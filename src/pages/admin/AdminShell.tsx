import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../../lib/auth'
import { errorText, supabase } from '../../lib/supabase'

/**
 * Stand-alone admin console: its own header, its own sign-in (separate session from the
 * member site) and no links in the public navigation. Every admin action is still
 * enforced in the database by require_admin(); this screen is only the front door.
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const { session, isAdmin, roleChecked, loading, signOut } = useAuth()

  useEffect(() => {
    document.title = 'DDF Admin Console'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  return (
    <div className="adm">
      <header className="adm-bar">
        <a href="/admin" className="adm-brand">
          <img src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="" width={30} height={30} />
          <span>DDF <b>Admin Console</b></span>
        </a>
        <div className="adm-right">
          {session && <span className="adm-who">{session.user.email}</span>}
          <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-pill-outline">開啟網站 ↗</a>
          {session && <button type="button" className="btn btn-pill-outline" onClick={signOut}>登出</button>}
        </div>
      </header>
      <main id="main">
        {!supabase ? <div className="container page"><p className="notice notice-warn">尚未連接 Supabase。</p></div>
          : loading ? <div className="container page"><p>載入中…</p></div>
          : !session ? <AdminLogin />
          : !roleChecked ? <div className="container page"><p>確認權限中…</p></div>
          : !isAdmin ? <NotAdmin email={session.user.email ?? ''} onSignOut={signOut} />
          : children}
      </main>
    </div>
  )
}

function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setErr(/Invalid login/i.test(error.message) ? 'Email 或密碼錯誤。' : errorText(error))
      setBusy(false)
      return
    }
    // On success the shell switches to the console (or to the no-permission screen).
  }

  return (
    <div className="adm-login">
      <form className="form card" onSubmit={submit}>
        <p className="ab-kicker" style={{ margin: 0 }}>Admin Only</p>
        <h1 style={{ margin: 0, fontSize: 28 }}>管理員登入</h1>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>此為 DDF 管理後台，與會員登入分開。僅限管理員專用帳號。</p>
        <label className="field">管理員 Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">密碼<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <p className="notice notice-error" role="alert">{err}</p>}
        <button className="btn btn-magic" type="submit" disabled={busy}>{busy ? '登入中…' : '登入後台'}</button>
      </form>
    </div>
  )
}

function NotAdmin({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="adm-login">
      <div className="card form">
        <h1 style={{ margin: 0, fontSize: 24 }}>沒有管理員權限</h1>
        <p style={{ margin: 0 }}>{email} 不是管理員帳號。</p>
        <button type="button" className="btn btn-magic" onClick={onSignOut}>登出並改用管理員帳號</button>
      </div>
    </div>
  )
}
