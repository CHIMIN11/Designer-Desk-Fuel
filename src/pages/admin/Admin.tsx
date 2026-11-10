import { useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { AUTH_STATUS, CATEGORY, PUB_STATUS, formatDate } from '../../lib/labels'
import { errorText, supabase } from '../../lib/supabase'
import { AdminCreateSpace, AdminEditSpace, type SpacePrefill } from './AdminSpaceForms'
import AdminMembers from './AdminMembers'
import { ReviewPhotos } from '../../components/SpaceReviews'
import { AdminBanners, AdminChatReports, AdminInquiries, AdminSuggestions } from './AdminExtras'

type Space = {
  id: string; business_name: string; address: string; city: string; district: string | null; category: string
  contact_email: string; official_website: string | null; official_social_url: string | null; opening_hours: string | null
  authorization_status: string; publication_status: string; is_demo: boolean
  last_verified_at: string | null; next_review_at: string | null
}
type Authz = {
  id: string; space_id: string; applicant_name: string; applicant_position: string; applicant_email: string
  authorization_status: string; authorization_scope: Record<string, unknown>; authorization_expires_at: string | null
  evidence_reference: string | null; created_at: string
}
type Asset = { id: string; space_id: string; asset_type: string; asset_url: string; permission_status: string; permission_scope: string | null; permission_expires_at: string | null }
type UpdateReq = { id: string; space_id: string; changes: Record<string, unknown>; status: string; created_at: string }
type Review = { id: string; space_id: string; author_id: string; body: string; tags: string[]; photo_urls?: string[]; status: string; created_at: string }
type Audit = { id: number; actor_id: string | null; actor_role: string; action: string; target_table: string; target_id: string | null; reason: string | null; created_at: string }

/** Admin sections grouped by job: listing review, members & community, marketing, system. */
const GROUPS = [
  { id: 'review', label: '空間審查', en: 'Space Review', tabs: [
    ['applications', '申請審核'], ['suggestions', '會員推薦'], ['publication', '上架管理'], ['assets', '素材授權'], ['updates', '資料更新'], ['create', '新增空間'],
  ] },
  { id: 'members', label: '會員與社群', en: 'Members & Community', tabs: [
    ['members', '會員管理'], ['reviews', '評價管理'], ['chat', '聊天檢舉'],
  ] },
  { id: 'marketing', label: '行銷', en: 'Marketing', tabs: [
    ['banners', 'Banner 管理'], ['inquiries', '合作洽詢'],
  ] },
  { id: 'system', label: '系統', en: 'System', tabs: [
    ['audit', '稽核紀錄'],
  ] },
] as const
type TabEntry = (typeof GROUPS)[number]['tabs'][number]
const TABS: readonly TabEntry[] = GROUPS.flatMap((g): readonly TabEntry[] => g.tabs)
type Tab = TabEntry[0]
const isTab = (v: string | null): v is Tab => TABS.some(([id]) => id === v)

const oneYear = () => new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)

export default function Admin() {
  const { session, isAdmin, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'applications'
  const setTab = (t: Tab) => setParams(t === 'applications' ? {} : { tab: t })
  const [prefill, setPrefill] = useState<SpacePrefill | null>(null)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [auths, setAuths] = useState<Authz[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [updates, setUpdates] = useState<UpdateReq[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [editSpace, setEditSpace] = useState<Record<string, unknown> | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !isAdmin) return
    const [s, a, as, u, l, rv] = await Promise.all([
      supabase.from('spaces').select('*').order('created_at', { ascending: false }),
      supabase.from('space_authorizations').select('*').order('created_at', { ascending: false }),
      supabase.from('space_assets').select('*').order('created_at', { ascending: false }),
      supabase.from('space_update_requests').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('admin_audit_log').select('*').order('id', { ascending: false }).limit(200),
      supabase.from('space_reviews').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    const firstError = [s, a, as, u, l, rv].find((r) => r.error)?.error
    if (firstError) setMsg({ kind: 'error', text: errorText(firstError) })
    setSpaces((s.data ?? []) as Space[])
    setAuths((a.data ?? []) as Authz[])
    setAssets((as.data ?? []) as Asset[])
    setUpdates((u.data ?? []) as UpdateReq[])
    setAudit((l.data ?? []) as Audit[])
    setReviews((rv.data ?? []) as Review[])
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  const call = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await supabase!.rpc(fn, args)
    setMsg(error ? { kind: 'error', text: errorText(error) } : { kind: 'ok', text: ok })
    load()
  }

  const ask = (q: string, def = '') => {
    const v = window.prompt(q, def)
    return v === null ? null : v.trim()
  }

  if (!supabase) return <div className="container page"><p className="notice notice-warn">尚未連接 Supabase。</p></div>
  if (loading) return <div className="container page"><p>載入中…</p></div>
  if (!session) return null
  if (!isAdmin) return <div className="container page"><h1>無權限</h1><p className="lead">此頁僅限 DDF 管理員。</p></div>

  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.business_name ?? id.slice(0, 8)
  const pendingAuths = auths.filter((a) => a.authorization_status === 'pending')
  const stats = [
    ['待審申請', pendingAuths.length],
    ['已公開', spaces.filter((s) => s.publication_status === 'published').length],
    ['待確認素材', assets.filter((a) => a.permission_status === 'pending').length],
    ['待審更新', updates.length],
    ['需複查', spaces.filter((s) => s.publication_status === 'published' && (!s.next_review_at || new Date(s.next_review_at) < new Date())).length],
  ] as const

  const group = GROUPS.find((g) => (g.tabs as readonly TabEntry[]).some(([id]) => id === tab))!
  const label = TABS.find(([id]) => id === tab)![1]
  const counts: Partial<Record<Tab, number>> = {
    applications: pendingAuths.length,
    assets: assets.filter((a) => a.permission_status === 'pending').length,
    updates: updates.length,
  }

  return (
    <div className="adm-layout">
      <nav className="adm-side" aria-label="後台分類">
        {GROUPS.map((g) => (
          <div key={g.id} className="adm-group">
            <p className="adm-group-h">{g.label}<span>{g.en}</span></p>
            {(g.tabs as readonly TabEntry[]).map(([id, l]) => (
              <button key={id} type="button" className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
                {l}{counts[id] ? <b className="adm-count">{counts[id]}</b> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <section className="adm-main">
      <p className="ab-kicker" style={{ marginBottom: 6 }}>{group.label} · {group.en}</p>
      <h1 className="adm-title">{label}</h1>

      {group.id === 'review' && (
        <div className="adm-stats">
          {stats.map(([l, n]) => (
            <div key={l} className="card"><div className="k">{l}</div><div className="v">{n}</div></div>
          ))}
        </div>
      )}

      {msg && <p className={`notice notice-${msg.kind === 'ok' ? 'ok' : 'error'}`} role="status">{msg.text}</p>}

      {tab === 'applications' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>空間</th><th>申請人</th><th>授權範圍</th><th>送出時間</th><th>操作</th></tr></thead>
            <tbody>
              {pendingAuths.length === 0 && <tr><td colSpan={5}>目前沒有待審申請。</td></tr>}
              {pendingAuths.map((a) => {
                const s = spaces.find((x) => x.id === a.space_id)
                return (
                  <tr key={a.id}>
                    <td><b>{s?.business_name}</b>{s?.is_demo && <span className="badge badge-stale" style={{ marginLeft: 6 }}>DEMO</span>}<br />{s && `${CATEGORY[s.category]} · ${s.city} ${s.district ?? ''}`}<br />{s?.address}<br />
                      {s?.official_website && <a href={s.official_website} target="_blank" rel="noopener noreferrer">官方網站</a>} {s?.official_social_url && <a href={s.official_social_url} target="_blank" rel="noopener noreferrer">官方社群</a>}</td>
                    <td>{a.applicant_name}（{a.applicant_position}）<br />{a.applicant_email}</td>
                    <td>{Object.entries(a.authorization_scope).filter(([, v]) => v === true).map(([k]) => k).join('、')}<br /><small>條款 {String(a.authorization_scope.terms_version)}</small></td>
                    <td>{formatDate(a.created_at)}</td>
                    <td className="actions">
                      <button className="btn btn-primary" type="button" onClick={() => {
                        const evidence = ask('授權證明（例如：官方 Email 確認、官方帳號私訊截圖編號）')
                        if (!evidence) return
                        const expires = ask('授權到期日（YYYY-MM-DD）', oneYear())
                        if (!expires) return
                        call('admin_review_authorization', { p_authorization_id: a.id, p_decision: 'approved', p_expires_at: new Date(expires).toISOString(), p_evidence_reference: evidence, p_reason: '身份與授權資格已驗證' }, '已核准授權。下一步：核對資料後上架。')
                      }}>核准</button>
                      <button className="btn btn-danger" type="button" onClick={() => {
                        const reason = ask('未通過原因')
                        if (reason) call('admin_review_authorization', { p_authorization_id: a.id, p_decision: 'rejected', p_expires_at: null, p_evidence_reference: null, p_reason: reason }, '已標記為未通過。')
                      }}>未通過</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'create' && <AdminCreateSpace key={prefill?.suggestionId ?? 'blank'} prefill={prefill} onDone={() => { setPrefill(null); load() }} />}

      {tab === 'members' && <AdminMembers />}

      {tab === 'chat' && <AdminChatReports />}

      {tab === 'banners' && <AdminBanners />}

      {tab === 'inquiries' && <AdminInquiries />}

      {tab === 'suggestions' && <AdminSuggestions onConvert={(p) => { setPrefill(p); setTab('create') }} />}

      {tab === 'publication' && editSpace && (
        <AdminEditSpace row={editSpace} onClose={(changed) => { setEditSpace(null); if (changed) { setMsg({ kind: 'ok', text: '已更新空間資料並寫入稽核紀錄。' }); load() } }} />
      )}

      {tab === 'publication' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>空間</th><th>授權</th><th>刊登</th><th>最後確認 / 下次複查</th><th>操作</th></tr></thead>
            <tbody>
              {spaces.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.business_name}</b>{s.is_demo && <span className="badge badge-stale" style={{ marginLeft: 6 }}>DEMO</span>}<br />{CATEGORY[s.category]} · {s.city}</td>
                  <td>{AUTH_STATUS[s.authorization_status]}</td>
                  <td>{PUB_STATUS[s.publication_status]}</td>
                  <td>{formatDate(s.last_verified_at)}<br />{formatDate(s.next_review_at)}</td>
                  <td className="actions">
                    <button className="btn btn-ghost" type="button" onClick={() => { setEditSpace(s as unknown as Record<string, unknown>); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>編輯</button>
                    <button className="btn btn-ghost" type="button" onClick={() => {
                      const note = ask('核對說明（例如：已與官方網站核對地址與營業時間）')
                      if (note) call('admin_verify_space', { p_space_id: s.id, p_next_review_at: null, p_note: note }, '已記錄資料核對，180 天後需複查。')
                    }}>核對資料</button>
                    {s.publication_status !== 'published' && !s.is_demo && (
                      <button className="btn btn-primary" type="button" onClick={() => call('admin_set_publication', { p_space_id: s.id, p_status: 'published', p_reason: null }, '已公開上架。')}>上架</button>
                    )}
                    {s.publication_status === 'published' && (
                      <button className="btn btn-ghost" type="button" onClick={() => {
                        const r = ask('暫停原因')
                        if (r) call('admin_set_publication', { p_space_id: s.id, p_status: 'suspended', p_reason: r }, '已暫停刊登。')
                      }}>暫停</button>
                    )}
                    {s.publication_status !== 'removed' && (
                      <button className="btn btn-danger" type="button" onClick={() => {
                        const r = ask('撤下原因')
                        if (r) call('admin_set_publication', { p_space_id: s.id, p_status: 'removed', p_reason: r }, '已撤下。')
                      }}>撤下</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'assets' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>空間</th><th>類型</th><th>素材</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>
              {assets.length === 0 && <tr><td colSpan={5}>沒有素材。</td></tr>}
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{spaceName(a.space_id)}</td>
                  <td>{a.asset_type}</td>
                  <td><a href={a.asset_url} target="_blank" rel="noopener noreferrer">開啟素材</a><br /><small>{a.permission_scope}</small></td>
                  <td>{a.permission_status}{a.permission_expires_at && <><br /><small>到期 {formatDate(a.permission_expires_at)}</small></>}</td>
                  <td className="actions">
                    {a.permission_status !== 'granted' && (
                      <button className="btn btn-primary" type="button" onClick={() => {
                        const r = ask('確認依據（例如：店家申請時勾選照片授權，已核對為店家自有照片）')
                        if (r) call('admin_set_asset_permission', { p_asset_id: a.id, p_status: 'granted', p_expires_at: null, p_reason: r }, '已確認素材授權。')
                      }}>確認授權</button>
                    )}
                    {a.permission_status !== 'revoked' && (
                      <button className="btn btn-danger" type="button" onClick={() => {
                        const r = ask('撤銷原因')
                        if (r) call('admin_set_asset_permission', { p_asset_id: a.id, p_status: 'revoked', p_expires_at: null, p_reason: r }, '已撤銷素材授權。')
                      }}>撤銷</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'updates' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>空間</th><th>變更內容</th><th>送出時間</th><th>操作</th></tr></thead>
            <tbody>
              {updates.length === 0 && <tr><td colSpan={4}>沒有待審的更新申請。</td></tr>}
              {updates.map((u) => (
                <tr key={u.id}>
                  <td>{spaceName(u.space_id)}</td>
                  <td><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{JSON.stringify(u.changes, null, 2)}</pre></td>
                  <td>{formatDate(u.created_at)}</td>
                  <td className="actions">
                    <button className="btn btn-primary" type="button" onClick={() => {
                      const r = ask('核對說明')
                      if (r) call('admin_review_update_request', { p_request_id: u.id, p_decision: 'approved', p_reason: r }, '已套用更新並更新最後確認日期。')
                    }}>核准並更新</button>
                    <button className="btn btn-danger" type="button" onClick={() => {
                      const r = ask('退回原因')
                      if (r) call('admin_review_update_request', { p_request_id: u.id, p_decision: 'rejected', p_reason: r }, '已退回更新申請。')
                    }}>退回</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>空間</th><th>內容</th><th>狀態</th><th>時間</th><th>操作</th></tr></thead>
            <tbody>
              {reviews.length === 0 && <tr><td colSpan={5}>沒有評價。</td></tr>}
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>{spaceName(r.space_id)}</td>
                  <td style={{ maxWidth: 420 }}>{r.body}<br /><small>{r.tags.join('、')}</small>{r.photo_urls && r.photo_urls.length > 0 && <ReviewPhotos urls={r.photo_urls} />}</td>
                  <td>{r.status === 'visible' ? '顯示中' : '已隱藏'}</td>
                  <td>{formatDate(r.created_at)}</td>
                  <td className="actions">
                    <button className={`btn ${r.status === 'visible' ? 'btn-danger' : 'btn-ghost'}`} type="button" onClick={() => {
                      const next = r.status === 'visible' ? 'hidden' : 'visible'
                      const reason = ask(next === 'hidden' ? '隱藏原因（例如：廣告、不實、騷擾）' : '恢復顯示原因')
                      if (reason) call('admin_set_review_status', { p_review_id: r.id, p_status: next, p_reason: reason }, next === 'hidden' ? '已隱藏評價。' : '已恢復顯示。')
                    }}>{r.status === 'visible' ? '隱藏' : '恢復顯示'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>時間</th><th>操作者</th><th>操作</th><th>對象</th><th>原因</th></tr></thead>
            <tbody>
              {audit.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString('zh-TW')}</td>
                  <td>{l.actor_role}<br /><small>{l.actor_id?.slice(0, 8)}</small></td>
                  <td>{l.action}</td>
                  <td>{l.target_table === 'spaces' && l.target_id ? spaceName(l.target_id) : `${l.target_table} ${l.target_id?.slice(0, 8) ?? ''}`}</td>
                  <td>{l.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </section>
    </div>
  )
}
