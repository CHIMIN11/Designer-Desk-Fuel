import { asset } from '../lib/asset'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Icon from './Icon'
import JoinCTA from './JoinCTA'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Layout() {
  const { session, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, search } = useLocation()

  // Close the mobile menu after navigating.
  useEffect(() => { setMenuOpen(false) }, [pathname, search])

  return (
    <>
      {import.meta.env.VITE_PREVIEW === 'true' && (
        <div className="config-banner" role="status">設計預覽版：此預覽無法連線資料庫，登入、目錄與申請功能請在正式部署後使用。</div>
      )}
      {!isSupabaseConfigured && (
        <div className="config-banner" role="status">
          開發模式：尚未連接 Supabase，目錄、申請與後台功能暫時無法使用（不會顯示任何假資料）。
        </div>
      )}
      <header className="site-header">
        <div className="bar">
          <Link to="/" className="brand" aria-label="DDF Designer Desk Fuel 首頁">
            <img src={asset('/logo-mark.png')} alt="" />
            <span className="brand-name">Designer Desk Fuel</span>
          </Link>
          <button type="button" className="menu-btn" aria-label={menuOpen ? '關閉選單' : '開啟選單'} aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? 'close' : 'menu'} size={24} stroke={1.8} />
          </button>
          <nav id="main-nav" className={`main-nav${menuOpen ? ' open' : ''}`} aria-label="主選單">
            <NavLink to="/about">關於 DDF</NavLink>
            <NavLink to="/spaces" end>探索空間</NavLink>
            <NavLink to="/venues">活動與講座</NavLink>
            <NavLink to="/community">設計師社群</NavLink>
            <NavLink to="/map">魔法師地圖</NavLink>
            <NavLink to="/resources">創作資源</NavLink>
            <NavLink to="/partners">品牌合作</NavLink>
            {session && <NavLink to="/account">會員中心</NavLink>}
            {session && <NavLink to="/merchant">店家中心</NavLink>}
            <div className="drawer-auth">
              {session ? (
                <button type="button" className="btn btn-pill-outline" onClick={signOut}>登出</button>
              ) : (
                <>
                  <Link to="/login" className="btn btn-pill-outline">登入</Link>
                  <Link to="/login?mode=signup" className="btn btn-magic">註冊成為魔法師+</Link>
                </>
              )}
            </div>
          </nav>
          <div className="header-actions">
            <Link to="/spaces" className="icon-btn" aria-label="搜尋空間"><Icon name="search" size={22} stroke={1.8} /></Link>
            {session ? (
              <button type="button" className="btn btn-pill-outline" onClick={signOut}>登出</button>
            ) : (
              <>
                <Link to="/login" className="btn btn-pill-outline">登入</Link>
                <Link to="/login?mode=signup" className="btn btn-magic">註冊成為魔法師+</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="快速導覽">
        <NavLink to="/" end><Icon name="home" size={22} /><span>首頁</span></NavLink>
        <NavLink to="/spaces" end><Icon name="search" size={22} /><span>探索</span></NavLink>
        <NavLink to="/venues"><Icon name="calendar" size={22} /><span>活動</span></NavLink>
        <NavLink to="/reviews"><Icon name="chat" size={22} /><span>評價</span></NavLink>
        <NavLink to={session ? '/account' : '/login'}><Icon name="user" size={22} /><span>{session ? '我的' : '登入'}</span></NavLink>
      </nav>

      {!['/contact', '/login', '/reset-password', '/lounge'].includes(pathname) && <JoinCTA />}

      <footer className="site-footer">
        <div className="container ft">
          <div className="ft-brand">
            <img src={asset('/logo-full.png')} alt="DDF Designer Desk Fuel" />
            <p className="ft-tag">Find Your Space.<br />Fuel Your Magic.</p>
            <p className="ft-note">DDF 為工作空間資訊目錄。刊登資訊由店家授權提供並經 DDF 核對，不代表 DDF 推薦、認證、背書或品質保證。</p>
          </div>
          <nav className="ft-col" aria-label="探索">
            <p className="ft-h">探索</p>
            <Link to="/spaces">探索空間</Link>
            <Link to="/spaces?events=1">活動與講座</Link>
            <Link to="/map">魔法師地圖</Link>
            <Link to="/community">設計師社群</Link>
            <Link to="/about">關於 DDF</Link>
          </nav>
          <nav className="ft-col" aria-label="合作">
            <p className="ft-h">合作</p>
            <Link to="/contact">聯絡我們・合作方案</Link>
            <Link to="/list-your-space">店家申請刊登</Link>
            <Link to="/partners">品牌合作</Link>
            <Link to="/listing-terms">店家刊登授權條款</Link>
            <Link to="/asset-guidelines">素材使用規範</Link>
          </nav>
          <nav className="ft-col" aria-label="條款與隱私">
            <p className="ft-h">條款與隱私</p>
            <Link to="/privacy-policy">隱私權政策</Link>
            <Link to="/terms-of-service">服務條款</Link>
            <Link to="/community-guidelines">社群守則</Link>
            <Link to="/cookie-policy">Cookie 政策</Link>
            <Link to="/data-request">個資申請</Link>
          </nav>
        </div>
        <div className="container ft-bottom">
          <p>© {new Date().getFullYear()} Designer Desk Fuel（DDF）. All rights reserved.</p>
          <p className="ft-made">Made in Taiwan for designers ✦</p>
        </div>
      </footer>
    </>
  )
}
