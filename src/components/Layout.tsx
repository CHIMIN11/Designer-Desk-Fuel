import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Layout() {
  const { session, isAdmin, signOut } = useAuth()

  return (
    <>
      {!isSupabaseConfigured && (
        <div className="config-banner" role="status">
          開發模式：尚未連接 Supabase，目錄、申請與後台功能暫時無法使用（不會顯示任何假資料）。
        </div>
      )}
      <header className="site-header">
        <div className="bar">
          <Link to="/" className="brand" aria-label="DDF Designer Desk Fuel 首頁">
            <img src="/logo-mark.png" alt="" />
            <span className="words">
              <span className="w1 gold-text">DESIGNER</span>
              <span className="w2">DESK FUEL</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="主選單">
            <NavLink to="/about">關於 DDF</NavLink>
            <NavLink to="/spaces">探索空間</NavLink>
            <NavLink to="/listing-terms">刊登說明</NavLink>
            <NavLink to="/list-your-space" className="merchant">店家申請刊登</NavLink>
            {session && <NavLink to="/my-spaces">我的刊登</NavLink>}
            {isAdmin && <NavLink to="/admin">管理後台</NavLink>}
          </nav>
          <div className="header-actions">
            {session ? (
              <button type="button" className="btn btn-ghost" onClick={signOut}>登出</button>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">登入</Link>
                <Link to="/login?mode=signup" className="btn btn-primary">註冊成為魔法師+</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <img src="/logo-full.png" alt="DDF Designer Desk Fuel" style={{ height: 80, width: 'auto' }} />
            <span style={{ fontSize: 13, color: 'var(--muted-2)' }}>Find Your Desk.<br />Fuel Your Creativity.</span>
          </div>
          <nav aria-label="法律與政策">
            <Link to="/privacy-policy">隱私權政策</Link>
            <Link to="/terms-of-service">服務條款</Link>
            <Link to="/community-guidelines">社群守則</Link>
            <Link to="/cookie-policy">Cookie 政策</Link>
            <Link to="/data-request">個資申請</Link>
            <Link to="/listing-terms">店家刊登授權條款</Link>
            <Link to="/asset-guidelines">素材使用規範</Link>
          </nav>
          <p className="disclaimer">
            DDF 為工作空間資訊目錄。刊登資訊由店家授權提供並經 DDF 核對，不代表 DDF 推薦、認證、背書或品質保證。
          </p>
        </div>
      </footer>
    </>
  )
}
