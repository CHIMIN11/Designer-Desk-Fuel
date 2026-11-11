/**
 * Security tests for the Authorized Workspace Directory.
 * Runs the real migrations on a real Postgres engine (PGlite) and exercises them
 * as the anon / authenticated roles, exactly as Supabase clients would.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const migrationsDir = join(root, 'supabase', 'migrations')

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const MERCHANT_A = '00000000-0000-0000-0000-0000000000a1'
const MERCHANT_B = '00000000-0000-0000-0000-0000000000b1'
const MEMBER = '00000000-0000-0000-0000-0000000000c1'

type Who = 'anon' | 'superuser' | string

let db: PGlite

async function as<T = Record<string, unknown>>(who: Who, sql: string, params: unknown[] = []) {
  if (who === 'superuser') {
    return (await db.query<T>(sql, params)).rows
  }
  const role = who === 'anon' ? 'anon' : 'authenticated'
  const sub = who === 'anon' ? '' : who
  await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role ${role};`)
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

const space = (name = 'Studio One') => ({
  business_name: name,
  address: '台北市中山區某路 1 號',
  city: '台北市',
  district: '中山區',
  category: 'cafe',
  price_range: '200_400',
  opening_hours: '09:00-20:00',
  wifi_available: true,
  power_outlets: 'some',
  seating_information: '單人座 8 席',
  large_tables: true,
  supports_events: true,
  event_capacity: 30,
  group_friendly: true,
  no_time_limit: true,
  minimum_charge: 150,
  has_restroom: true,
  official_website: 'https://example.com',
  contact_email: 'owner@example.com',
})

const authorization = {
  applicant_name: '王小明',
  applicant_position: '店長',
  applicant_email: 'owner@example.com',
  accepted_terms: true,
  terms_version: '2026-11-draft',
  scope: { photos: true, logo: true, official_text: false },
}

async function submit(who: string, name?: string): Promise<string> {
  const rows = await as<{ id: string }>(who, 'select public.submit_space_application($1, $2) as id', [
    JSON.stringify(space(name)),
    JSON.stringify(authorization),
  ])
  return rows[0].id
}

async function authIdFor(spaceId: string) {
  const rows = await as<{ id: string }>('superuser', 'select id from public.space_authorizations where space_id = $1', [spaceId])
  return rows[0].id
}

async function approve(spaceId: string) {
  await as(ADMIN, `select public.admin_review_authorization($1, 'approved', now() + interval '1 year', 'Email confirmation #123', 'ok')`, [
    await authIdFor(spaceId),
  ])
}

async function publishFully(who = MERCHANT_A, name?: string) {
  const id = await submit(who, name)
  await approve(id)
  await as(ADMIN, `select public.admin_verify_space($1, now() + interval '180 days', 'checked')`, [id])
  await as(ADMIN, `select public.admin_set_publication($1, 'published', null)`, [id])
  return id
}

async function publicIds(who: Who = 'anon') {
  const rows = await as<{ id: string }>(who, 'select id from public.list_public_spaces()')
  return rows.map((r) => r.id)
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(readFileSync(join(root, 'tests', 'db', 'supabaseStub.sql'), 'utf8'))
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@example.com'), ('${MERCHANT_A}', 'a@example.com'),
      ('${MERCHANT_B}', 'b@example.com');
    insert into auth.users (id, email, raw_user_meta_data) values ('${MEMBER}', 'm@example.com', '{"display_name":"Miko"}');
    insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin');
  `)
})

describe('1. 未授權店家無法公開顯示', () => {
  it('a submitted (pending) application is not in the public directory', async () => {
    const id = await submit(MERCHANT_A)
    expect(await publicIds('anon')).not.toContain(id)
    expect(await publicIds(MEMBER)).not.toContain(id)
  })

  it('anonymous visitors cannot read the spaces table directly', async () => {
    await submit(MERCHANT_A)
    await expect(as('anon', 'select * from public.spaces')).rejects.toThrow(/permission denied/)
  })

  it('other members see no rows when selecting spaces directly', async () => {
    await submit(MERCHANT_A)
    expect(await as(MEMBER, 'select * from public.spaces')).toHaveLength(0)
  })

  it('cannot publish without an approved authorization', async () => {
    const id = await submit(MERCHANT_A)
    await expect(as(ADMIN, `select public.admin_set_publication($1, 'published', null)`, [id])).rejects.toThrow(
      /valid approved authorization/,
    )
  })

  it('a rejected application never becomes public', async () => {
    const id = await submit(MERCHANT_A)
    await as(ADMIN, `select public.admin_review_authorization($1, 'rejected', null, null, 'not the owner')`, [await authIdFor(id)])
    expect(await publicIds()).not.toContain(id)
  })
})

describe('2. 審核中店家無法公開顯示', () => {
  it('approved but not yet verified/published is not public', async () => {
    const id = await submit(MERCHANT_A)
    await approve(id)
    expect(await publicIds()).not.toContain(id)
    await expect(as(ADMIN, `select public.admin_set_publication($1, 'published', null)`, [id])).rejects.toThrow(/verified/)
  })

  it('approved and verified but not published is not public', async () => {
    const id = await submit(MERCHANT_A)
    await approve(id)
    await as(ADMIN, `select public.admin_verify_space($1, null, 'checked')`, [id])
    expect(await publicIds()).not.toContain(id)
  })

  it('fully approved, verified and published is public, without the contact email', async () => {
    const id = await publishFully()
    expect(await publicIds()).toContain(id)
    const [row] = await as<Record<string, unknown>>('anon', 'select * from public.list_public_spaces() where id = $1', [id])
    expect(row).not.toHaveProperty('contact_email')
    expect(row.data_stale).toBe(false)
  })

  it('a suspended listing leaves the public directory', async () => {
    const id = await publishFully()
    await as(ADMIN, `select public.admin_set_publication($1, 'suspended', 'reported closed')`, [id])
    expect(await publicIds()).not.toContain(id)
  })
})

describe('3. 已撤回授權的店家會從公開目錄移除', () => {
  it('merchant withdrawal removes the listing immediately and revokes assets', async () => {
    const id = await publishFully()
    await as(MERCHANT_A, `select public.add_space_asset($1, 'photo', 'https://example.com/a.jpg', 'directory listing')`, [id])
    await as(MERCHANT_A, `select public.merchant_set_listing($1, 'withdraw', 'closing down')`, [id])

    expect(await publicIds()).not.toContain(id)
    const [s] = await as<{ authorization_status: string; publication_status: string }>(
      'superuser', 'select authorization_status, publication_status from public.spaces where id = $1', [id])
    expect(s).toEqual({ authorization_status: 'withdrawn', publication_status: 'removed' })
    const assets = await as<{ permission_status: string }>('superuser', 'select permission_status from public.space_assets where space_id = $1', [id])
    expect(assets.every((a) => a.permission_status === 'revoked')).toBe(true)
  })

  it('a withdrawn listing cannot be re-published by an admin', async () => {
    const id = await publishFully()
    await as(MERCHANT_A, `select public.merchant_set_listing($1, 'withdraw', null)`, [id])
    await expect(as(ADMIN, `select public.admin_set_publication($1, 'published', null)`, [id])).rejects.toThrow()
  })
})

describe('4. 授權過期的店家不再公開顯示', () => {
  it('disappears as soon as the expiry date passes, without any cron job', async () => {
    const id = await publishFully()
    await as('superuser', `update public.space_authorizations set authorization_expires_at = now() - interval '1 minute' where space_id = $1`, [id])
    expect(await publicIds()).not.toContain(id)
  })

  it('housekeeping marks expired authorizations', async () => {
    const id = await publishFully()
    await as('superuser', `update public.space_authorizations set authorization_expires_at = now() - interval '1 day' where space_id = $1`, [id])
    await as('superuser', 'select public.expire_space_authorizations()')
    const [s] = await as<{ authorization_status: string }>('superuser', 'select authorization_status from public.spaces where id = $1', [id])
    expect(s.authorization_status).toBe('expired')
  })

  it('past the review date, price and opening hours are withheld and the row is marked stale', async () => {
    const id = await publishFully()
    await as('superuser', `update public.spaces set next_review_at = now() - interval '1 day' where id = $1`, [id])
    const [row] = await as<Record<string, unknown>>('anon', 'select * from public.list_public_spaces() where id = $1', [id])
    expect(row.data_stale).toBe(true)
    expect(row.price_range).toBeNull()
    expect(row.opening_hours).toBeNull()
  })
})

describe('5. 未獲授權的照片不能使用', () => {
  it('only granted, unexpired assets of public spaces are returned', async () => {
    const id = await publishFully()
    const [{ pending }] = await as<{ pending: string }>(MERCHANT_A, `select public.add_space_asset($1, 'photo', 'https://example.com/p.jpg', 'listing') as pending`, [id])
    const [{ granted }] = await as<{ granted: string }>(MERCHANT_A, `select public.add_space_asset($1, 'logo', 'https://example.com/l.png', 'listing') as granted`, [id])
    const [{ expired }] = await as<{ expired: string }>(MERCHANT_A, `select public.add_space_asset($1, 'photo', 'https://example.com/e.jpg', 'listing') as expired`, [id])

    await as(ADMIN, `select public.admin_set_asset_permission($1, 'granted', null, 'logo ok')`, [granted])
    await as(ADMIN, `select public.admin_set_asset_permission($1, 'granted', now() - interval '1 day', 'old')`, [expired])

    const rows = await as<{ id: string }>('anon', 'select id from public.list_public_space_assets($1)', [id])
    expect(rows.map((r) => r.id)).toEqual([granted])
    expect(rows.map((r) => r.id)).not.toContain(pending)
  })

  it('granted assets of a non-public space are not returned', async () => {
    const id = await submit(MERCHANT_A)
    const [{ a }] = await as<{ a: string }>(MERCHANT_A, `select public.add_space_asset($1, 'photo', 'https://example.com/p.jpg', 'listing') as a`, [id])
    await as(ADMIN, `select public.admin_set_asset_permission($1, 'granted', null, 'ok')`, [a])
    expect(await as('anon', 'select * from public.list_public_space_assets($1)', [id])).toHaveLength(0)
  })
})

describe('6. 店家只能修改自己有權管理的資料', () => {
  it('another merchant cannot request updates, add assets or withdraw', async () => {
    const id = await publishFully(MERCHANT_A)
    await expect(as(MERCHANT_B, `select public.request_space_update($1, '{"opening_hours":"closed"}')`, [id])).rejects.toThrow(/not the manager/)
    await expect(as(MERCHANT_B, `select public.add_space_asset($1, 'photo', 'https://x.com/a.jpg', 'x')`, [id])).rejects.toThrow(/not the manager/)
    await expect(as(MERCHANT_B, `select public.merchant_set_listing($1, 'withdraw', null)`, [id])).rejects.toThrow(/not the manager/)
  })

  it('nobody can write to the spaces table directly, not even the owner', async () => {
    const id = await submit(MERCHANT_A)
    await expect(as(MERCHANT_A, `update public.spaces set publication_status = 'published' where id = $1`, [id])).rejects.toThrow(/permission denied/)
    await expect(as(MERCHANT_A, `insert into public.spaces (business_name, address, city, category, contact_email) values ('x','x','x','cafe','a@b.co')`)).rejects.toThrow(/permission denied/)
  })

  it('a merchant cannot change protected fields through an update request', async () => {
    const id = await publishFully()
    await expect(as(MERCHANT_A, `select public.request_space_update($1, '{"publication_status":"published"}')`, [id])).rejects.toThrow(/cannot be changed/)
  })

  it('a merchant update only goes live after admin approval', async () => {
    const id = await publishFully()
    const [{ r }] = await as<{ r: string }>(MERCHANT_A, `select public.request_space_update($1, '{"opening_hours":"10:00-18:00"}') as r`, [id])
    let [row] = await as<{ opening_hours: string }>('anon', 'select opening_hours from public.list_public_spaces() where id = $1', [id])
    expect(row.opening_hours).toBe('09:00-20:00')
    await as(ADMIN, `select public.admin_review_update_request($1, 'approved', 'confirmed by phone')`, [r])
    ;[row] = await as<{ opening_hours: string }>('anon', 'select opening_hours from public.list_public_spaces() where id = $1', [id])
    expect(row.opening_hours).toBe('10:00-18:00')
  })

  it('members cannot call admin functions or grant themselves a role', async () => {
    const id = await submit(MERCHANT_A)
    await expect(as(MERCHANT_A, `select public.admin_review_authorization($1, 'approved', now() + interval '1 year', 'x', 'x')`, [await authIdFor(id)])).rejects.toThrow(/admin only/)
    await expect(as(MERCHANT_A, `select public.admin_set_publication($1, 'published', null)`, [id])).rejects.toThrow(/admin only/)
    await expect(as(MERCHANT_A, `insert into public.user_roles (user_id, role) values ($1, 'admin')`, [MERCHANT_A])).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select public.submit_space_application('{}', '{}')`)).rejects.toThrow(/permission denied/)
  })
})

describe('7. 管理員可以查閱授權及更新紀錄', () => {
  it('admin reads authorizations and field-level update logs; merchants cannot read logs', async () => {
    const id = await publishFully()
    expect(await as(ADMIN, 'select * from public.space_authorizations where space_id = $1', [id])).toHaveLength(1)
    const logs = await as<{ field_name: string; update_source: string }>(ADMIN, 'select field_name, update_source from public.space_update_logs where space_id = $1', [id])
    expect(logs.map((l) => l.field_name)).toEqual(expect.arrayContaining(['authorization_status', 'last_verified_at', 'publication_status']))
    expect(await as(MERCHANT_A, 'select * from public.space_update_logs')).toHaveLength(0)
    expect(await as(MERCHANT_B, 'select * from public.space_authorizations')).toHaveLength(0)
  })
})

describe('8. 所有上架與下架操作都有紀錄', () => {
  it('publish, suspend and withdraw are all in the audit log, which is append-only', async () => {
    const id = await publishFully()
    await as(ADMIN, `select public.admin_set_publication($1, 'suspended', 'temporarily closed')`, [id])
    await as(MERCHANT_A, `select public.merchant_set_listing($1, 'withdraw', 'closing')`, [id])

    const actions = (await as<{ action: string }>(ADMIN, 'select action from public.admin_audit_log where target_id = $1 order by id', [id])).map((r) => r.action)
    expect(actions).toEqual(['application_submitted', 'data_verified', 'publication_published', 'publication_suspended', 'authorization_withdrawn'])
    expect(await as(MERCHANT_A, 'select * from public.admin_audit_log')).toHaveLength(0)
    await expect(as('superuser', 'delete from public.admin_audit_log')).rejects.toThrow(/append-only/)
  })

  it('suspending or removing requires a reason', async () => {
    const id = await publishFully()
    await expect(as(ADMIN, `select public.admin_set_publication($1, 'removed', '')`, [id])).rejects.toThrow(/reason/)
  })
})

describe('活動場地與聚會篩選', () => {
  it('filters by events, group meetups and large tables', async () => {
    const id = await publishFully()
    const ev = await as<{ id: string; event_capacity: number }>('anon', 'select id, event_capacity from public.list_public_spaces(p_events => true, p_group => true, p_large_tables => true)')
    expect(ev.map((r) => r.id)).toContain(id)
    expect(ev[0].event_capacity).toBe(30)
    expect(await as('anon', 'select id from public.list_public_spaces(p_events => false)')).toHaveLength(0)
    const work = await as<{ id: string; minimum_charge: number }>('anon', 'select id, minimum_charge from public.list_public_spaces(p_no_time_limit => true, p_clear_minimum => true, p_restroom => true)')
    expect(work.map((r) => r.id)).toContain(id)
    expect(work[0].minimum_charge).toBe(150)
  })

  it('withholds the minimum charge once data is stale', async () => {
    const id = await publishFully()
    await as('superuser', `update public.spaces set next_review_at = now() - interval '1 day' where id = $1`, [id])
    const [row] = await as<{ minimum_charge: number | null }>('anon', 'select minimum_charge from public.list_public_spaces() where id = $1', [id])
    expect(row.minimum_charge).toBeNull()
  })
})

describe('設計師真實評價', () => {
  const post = (who: string, spaceId: string, author = who, body = '插座在靠窗那排，平日下午很好找位子。') =>
    as(who, `insert into public.space_reviews (space_id, author_id, body, tags) values ($1, $2, $3, '{power_ok}') returning id`, [spaceId, author, body])

  it('members can review public spaces, and the public sees it without email', async () => {
    const id = await publishFully()
    await post(MEMBER, id)
    const rows = await as<Record<string, unknown>>('anon', 'select * from public.list_public_reviews($1)', [id])
    expect(rows).toHaveLength(1)
    expect(rows[0].author_name).toBe('Miko')
    expect(JSON.stringify(rows[0])).not.toContain('@')
  })

  it('cannot review a space that is not public', async () => {
    const id = await submit(MERCHANT_A)
    await expect(post(MEMBER, id)).rejects.toThrow(/row-level security/)
  })

  it('cannot post as someone else, twice, or anonymously', async () => {
    const id = await publishFully()
    await expect(post(MEMBER, id, MERCHANT_B)).rejects.toThrow(/row-level security/)
    await post(MEMBER, id)
    await expect(post(MEMBER, id)).rejects.toThrow(/duplicate key/)
    await expect(as('anon', `insert into public.space_reviews (space_id, author_id, body) values ($1, $2, '匿名留言測試內容')`, [id, MEMBER])).rejects.toThrow(/permission denied/)
  })

  it('authors cannot un-hide or move their review; others cannot edit it', async () => {
    const id = await publishFully()
    const [{ id: rid }] = await post(MEMBER, id) as { id: string }[]
    await expect(as(MEMBER, `update public.space_reviews set status = 'visible' where id = $1`, [rid])).rejects.toThrow(/permission denied/)
    const changed = await as(MERCHANT_B, `update public.space_reviews set body = '被別人改掉的內容內容' where id = $1 returning id`, [rid])
    expect(changed).toHaveLength(0)
  })

  it('admins can hide a review (audited); hidden reviews and reviews of withdrawn spaces leave public view', async () => {
    const id = await publishFully()
    const [{ id: rid }] = await post(MEMBER, id) as { id: string }[]
    await as(ADMIN, `select public.admin_set_review_status($1, 'hidden', 'spam')`, [rid])
    expect(await as('anon', 'select * from public.list_public_reviews($1)', [id])).toHaveLength(0)
    const actions = await as<{ action: string }>(ADMIN, `select action from public.admin_audit_log where target_id = $1`, [rid])
    expect(actions.map((a) => a.action)).toEqual(['review_hidden'])

    const id2 = await publishFully(MERCHANT_B, 'Second')
    await post(MEMBER, id2)
    await as(MERCHANT_B, `select public.merchant_set_listing($1, 'withdraw', null)`, [id2])
    expect(await as('anon', 'select * from public.list_public_reviews($1)', [id2])).toHaveLength(0)
  })

  it('photos: up to 3, only from the author\'s own folder, and shown with the public review', async () => {
    const id = await publishFully()
    const [{ id: rid }] = await post(MEMBER, id) as { id: string }[]
    const url = (owner: string, n: number) => `https://x.supabase.co/storage/v1/object/public/review-photos/${owner}/p${n}.jpg`
    await as(MEMBER, `update public.space_reviews set photo_urls = $2 where id = $1`, [rid, [url(MEMBER, 1), url(MEMBER, 2)]])
    const rows = await as<{ photo_urls: string[] }>('anon', 'select * from public.list_public_reviews($1)', [id])
    expect(rows[0].photo_urls).toHaveLength(2)
    expect(await as<{ photo_urls: string[] }>(MEMBER, 'select * from public.list_my_reviews()')).toHaveLength(1)
    await expect(as(MEMBER, `update public.space_reviews set photo_urls = $2 where id = $1`, [rid, [url(MERCHANT_B, 1)]])).rejects.toThrow(/uploaded by the author/)
    await expect(as(MEMBER, `update public.space_reviews set photo_urls = $2 where id = $1`, [rid, ['https://evil.example/x.jpg']])).rejects.toThrow(/uploaded by the author/)
    await expect(as(MEMBER, `update public.space_reviews set photo_urls = $2 where id = $1`, [rid, [1, 2, 3, 4].map((n) => url(MEMBER, n))])).rejects.toThrow(/check constraint/)
    await as(ADMIN, `select public.admin_set_review_status($1, 'hidden', 'privacy')`, [rid])
    expect(await as('anon', 'select * from public.list_public_reviews($1)', [id])).toHaveLength(0)
  })

  it('members cannot hide reviews', async () => {
    const id = await publishFully()
    const [{ id: rid }] = await post(MEMBER, id) as { id: string }[]
    await expect(as(MERCHANT_A, `select public.admin_set_review_status($1, 'hidden', 'x')`, [rid])).rejects.toThrow(/admin only/)
  })
})

describe('設計師個人資料', () => {
  it('profiles are private by default and only public/members ones are listed', async () => {
    expect(await as('anon', 'select * from public.list_designers()')).toHaveLength(0)
    await as(MEMBER, `update public.profiles set profession = 'UI 設計師', skills = '{Figma,UI}', profile_visibility = 'public' where id = $1`, [MEMBER])
    const rows = await as<Record<string, unknown>>('anon', 'select * from public.list_designers()')
    expect(rows.map((r) => r.display_name)).toEqual(['Miko'])
    expect(JSON.stringify(rows)).not.toContain('@')
    await as(MEMBER, `update public.profiles set profile_visibility = 'members' where id = $1`, [MEMBER])
    expect(await as('anon', 'select * from public.list_designers()')).toHaveLength(0)
    expect(await as(MERCHANT_A, 'select * from public.list_designers()')).toHaveLength(1)
    expect(await as('anon', `select * from public.list_designers('figma')`)).toHaveLength(0)
    expect(await as(MERCHANT_A, `select * from public.list_designers('figma')`)).toHaveLength(1)
  })

  it('members cannot edit other profiles or protected columns', async () => {
    const r = await as(MERCHANT_A, `update public.profiles set bio = 'hacked' where id = $1 returning id`, [MEMBER])
    expect(r).toHaveLength(0)
    await expect(as(MEMBER, `update public.profiles set created_at = now() where id = $1`, [MEMBER])).rejects.toThrow(/permission denied/)
  })

  it('admins can read and edit profiles, with an audit record', async () => {
    expect((await as(ADMIN, 'select id from public.profiles')).length).toBeGreaterThanOrEqual(1)
    await as(ADMIN, `select public.admin_update_profile($1, '{"bio":"已更正"}', '使用者回報')`, [MEMBER])
    const [p] = await as<{ bio: string }>('superuser', 'select bio from public.profiles where id = $1', [MEMBER])
    expect(p.bio).toBe('已更正')
    const log = await as<{ action: string }>(ADMIN, `select action from public.admin_audit_log where target_id = $1`, [MEMBER])
    expect(log.map((l) => l.action)).toContain('profile_updated')
    await expect(as(MEMBER, `select public.admin_update_profile($1, '{"bio":"x"}', 'x')`, [MEMBER])).rejects.toThrow(/admin only/)
  })
})

describe('管理員建立與編輯空間', () => {
  it('admin-created space with evidence is approved, still needs verification to publish', async () => {
    const [{ id }] = await as<{ id: string }>(ADMIN, `select public.admin_create_space($1, $2, $3) as id`, [
      JSON.stringify(space('Admin Entered')),
      JSON.stringify({ applicant_name: '店長', applicant_position: '店長', applicant_email: 'o@example.com', evidence_reference: 'Email 2026-11-10', expires_at: new Date(Date.now() + 864e5 * 365).toISOString(), scope: { photos: true } }),
      'a@example.com',
    ])
    const [s] = await as<{ authorization_status: string; owner_id: string }>('superuser', 'select authorization_status, owner_id from public.spaces where id = $1', [id])
    expect(s).toEqual({ authorization_status: 'approved', owner_id: MERCHANT_A })
    expect(await publicIds()).not.toContain(id)
    await as(ADMIN, `select public.admin_verify_space($1, null, 'ok')`, [id])
    await as(ADMIN, `select public.admin_set_publication($1, 'published', null)`, [id])
    expect(await publicIds()).toContain(id)
    // the assigned business account can now manage it
    expect(await as(MERCHANT_A, 'select id from public.spaces where id = $1', [id])).toHaveLength(1)
  })

  it('without evidence it stays pending; members cannot create or edit', async () => {
    const [{ id }] = await as<{ id: string }>(ADMIN, `select public.admin_create_space($1, $2, null) as id`, [
      JSON.stringify(space('No Evidence')),
      JSON.stringify({ applicant_name: 'x', applicant_position: 'x', applicant_email: 'o@example.com' }),
    ])
    const [s] = await as<{ authorization_status: string }>('superuser', 'select authorization_status from public.spaces where id = $1', [id])
    expect(s.authorization_status).toBe('pending')
    await expect(as(MEMBER, `select public.admin_create_space('{}', '{}', null)`)).rejects.toThrow(/admin only/)
    // contacts are optional for admin-entered listings
    const bare = space('Bare Contacts') as Record<string, unknown>
    delete bare.contact_email
    const [{ id: bid }] = await as<{ id: string }>(ADMIN, `select public.admin_create_space($1, $2, null) as id`, [
      JSON.stringify(bare), JSON.stringify({ evidence_reference: 'IG 私訊同意', expires_at: new Date(Date.now() + 864e5 * 365).toISOString() }),
    ])
    const [ba] = await as<{ applicant_name: string; authorization_status: string }>('superuser', 'select applicant_name, authorization_status from public.space_authorizations where space_id = $1', [bid])
    expect(ba).toEqual({ applicant_name: '未提供（管理員代填）', authorization_status: 'approved' })
    await expect(as(MERCHANT_A, `select public.admin_update_space($1, '{"opening_hours":"x"}', 'x')`, [id])).rejects.toThrow(/admin only/)
  })

  it('admin edits are applied, logged per field and audited', async () => {
    const id = await publishFully()
    await as(ADMIN, `select public.admin_update_space($1, '{"opening_hours":"12:00-22:00","minimum_charge":200}', '店家來信更新')`, [id])
    const [row] = await as<{ opening_hours: string; minimum_charge: number }>('anon', 'select opening_hours, minimum_charge from public.list_public_spaces() where id = $1', [id])
    expect(row).toEqual({ opening_hours: '12:00-22:00', minimum_charge: 200 })
    const logs = await as<{ field_name: string; update_source: string }>(ADMIN, `select field_name, update_source from public.space_update_logs where space_id = $1 and field_name = 'opening_hours'`, [id])
    expect(logs[0].update_source).toBe('admin')
    await expect(as(ADMIN, `select public.admin_update_space($1, '{"publication_status":"published"}', 'x')`, [id])).rejects.toThrow(/cannot be changed/)
  })
})

describe('我的評價後台', () => {
  it('lists only my own reviews, with the space name', async () => {
    const id = await publishFully()
    await as(MEMBER, `insert into public.space_reviews (space_id, author_id, body) values ($1, $2, '插座很多，適合一個人久坐工作。')`, [id, MEMBER])
    const mine = await as<{ business_name: string; space_public: boolean }>(MEMBER, 'select * from public.list_my_reviews()')
    expect(mine).toHaveLength(1)
    expect(mine[0].business_name).toBe('Studio One')
    expect(mine[0].space_public).toBe(true)
    expect(await as(MERCHANT_B, 'select * from public.list_my_reviews()')).toHaveLength(0)
  })
})

describe('店家照片上傳', () => {
  it('limits a listing to 3 photos and 1 logo; withdrawn photos free a slot', async () => {
    const id = await submit(MERCHANT_A)
    const add = (type: string, n: number) => as<{ a: string }>(MERCHANT_A, `select public.add_space_asset($1, $2, $3, 'listing') as a`, [id, type, `https://example.com/${type}${n}.jpg`])
    const [{ a: first }] = await add('photo', 1)
    await add('photo', 2)
    await add('photo', 3)
    await expect(add('photo', 4)).rejects.toThrow(/at most 3 photos/)
    await add('logo', 1)
    await expect(add('logo', 2)).rejects.toThrow(/only 1 logo/)
    await as(MERCHANT_A, `select public.merchant_remove_asset($1)`, [first])
    await add('photo', 5)
    await expect(as(MERCHANT_B, `select public.merchant_remove_asset($1)`, [first])).rejects.toThrow(/not the manager/)
  })

  it('members can only upload into their own storage folder', async () => {
    await as(MERCHANT_A, `insert into storage.objects (bucket_id, name) values ('space-assets', $1)`, [`${MERCHANT_A}/s1/a.jpg`])
    await expect(as(MERCHANT_A, `insert into storage.objects (bucket_id, name) values ('space-assets', $1)`, [`${MERCHANT_B}/s1/a.jpg`])).rejects.toThrow(/row-level security/)
    await expect(as('anon', `insert into storage.objects (bucket_id, name) values ('space-assets', 'x/a.jpg')`)).rejects.toThrow(/row-level security/)
  })
})

describe('Banner 管理', () => {
  it('only admins manage banners; the public sees active, in-schedule ones', async () => {
    const ins = `insert into public.site_banners (title, image_url, is_active, starts_at, ends_at) values ($1, 'https://example.com/b.jpg', $2, $3, $4)`
    await expect(as(MEMBER, ins, ['x', true, null, null])).rejects.toThrow(/row-level security/)
    await as(ADMIN, ins, ['現在', true, null, null])
    await as(ADMIN, ins, ['停用', false, null, null])
    await as(ADMIN, ins, ['未來', true, new Date(Date.now() + 864e5).toISOString(), null])
    await as(ADMIN, ins, ['過期', true, null, new Date(Date.now() - 1000).toISOString()])
    const rows = await as<{ title: string }>('anon', 'select title from public.list_active_banners()')
    expect(rows.map((r) => r.title)).toEqual(['現在'])
    await expect(as(MEMBER, `insert into storage.objects (bucket_id, name) values ('site-banners', 'a.jpg')`)).rejects.toThrow(/row-level security/)
    await as(ADMIN, `insert into storage.objects (bucket_id, name) values ('site-banners', 'a.jpg')`)
  })
})

describe('DDF Lounge 聊天室', () => {
  const channel = async () => (await as<{ id: string }>('superuser', `select id from public.chat_channels where slug = 'general-lounge'`))[0].id
  const send = (who: string, body: string, cid: string, sender = who) =>
    as<{ id: string }>(who, `insert into public.chat_messages (channel_id, sender_id, body) values ($1, $2, $3) returning id`, [cid, sender, body])

  it('only signed-in members read and post, and cannot forge the sender', async () => {
    const cid = await channel()
    await send(MEMBER, '大家好！', cid)
    expect(await as(MERCHANT_A, 'select body from public.chat_messages')).toHaveLength(1)
    await expect(as('anon', 'select * from public.chat_messages')).rejects.toThrow(/permission denied/)
    await expect(as('anon', `insert into public.chat_messages (channel_id, sender_id, body) values ($1, $2, 'x')`, [cid, MEMBER])).rejects.toThrow(/permission denied/)
    await expect(send(MERCHANT_A, '冒充別人', cid, MEMBER)).rejects.toThrow(/row-level security/)
  })

  it('limits message length, speed and duplicates', async () => {
    const cid = await channel()
    await expect(send(MEMBER, 'x'.repeat(501), cid)).rejects.toThrow(/check constraint/)
    await send(MEMBER, '同一句話', cid)
    await expect(send(MEMBER, '同一句話', cid)).rejects.toThrow(/duplicate message/)
    for (const n of [1, 2, 3, 4]) await send(MEMBER, `訊息 ${n}`, cid)
    await expect(send(MEMBER, '第六則', cid)).rejects.toThrow(/sending too fast/)
  })

  it('members delete only their own messages; admins delete any (audited) and see reports', async () => {
    const cid = await channel()
    const [{ id: mine }] = await send(MEMBER, '我的訊息', cid)
    const [{ id: theirs }] = await send(MERCHANT_A, '別人的訊息', cid)
    await expect(as(MEMBER, `select public.delete_chat_message($1)`, [theirs])).rejects.toThrow(/not allowed/)
    await expect(as(MEMBER, `update public.chat_messages set body = 'x' where id = $1`, [theirs])).rejects.toThrow(/permission denied/)
    await as(MEMBER, `select public.delete_chat_message($1)`, [mine])
    expect((await as<{ id: string }>(MERCHANT_B, 'select id from public.chat_messages')).map((r) => r.id)).toEqual([theirs])

    await as(MEMBER, `insert into public.chat_reports (message_id, reporter_id, report_type) values ($1, $2, 'spam')`, [theirs, MEMBER])
    expect(await as(MERCHANT_B, 'select * from public.chat_reports')).toHaveLength(0)
    expect(await as(ADMIN, 'select * from public.chat_reports')).toHaveLength(1)
    await as(ADMIN, `select public.delete_chat_message($1, 'spam')`, [theirs])
    const [r] = await as<{ status: string }>(ADMIN, 'select status from public.chat_reports')
    expect(r.status).toBe('resolved')
    expect((await as<{ action: string }>(ADMIN, `select action from public.admin_audit_log where target_id = $1`, [theirs])).map((a) => a.action)).toEqual(['chat_message_deleted'])
  })

  it('display names are for members only and never include email', async () => {
    const rows = await as<Record<string, unknown>>(MERCHANT_A, 'select * from public.chat_display_names($1)', [[MEMBER]])
    expect(rows[0].display_name).toBe('Miko')
    expect(JSON.stringify(rows)).not.toContain('@')
    await expect(as('anon', 'select * from public.chat_display_names($1)', [[MEMBER]])).rejects.toThrow(/permission denied/)
  })
})

describe('DEMO data and account deletion', () => {
  it('DEMO rows never appear publicly and cannot be published', async () => {
    const id = await publishFully(MERCHANT_A, 'DEMO 空間 A')
    await as('superuser', 'update public.spaces set is_demo = true where id = $1', [id])
    expect(await publicIds()).not.toContain(id)
    await as(ADMIN, `select public.admin_set_publication($1, 'suspended', 'demo')`, [id])
    await expect(as(ADMIN, `select public.admin_set_publication($1, 'published', null)`, [id])).rejects.toThrow(/DEMO/)
  })

  it('deleting a merchant account keeps the listing records intact', async () => {
    const id = await publishFully()
    await as('superuser', 'delete from auth.users where id = $1', [MERCHANT_A])
    const [s] = await as<{ owner_id: string | null }>('superuser', 'select owner_id from public.spaces where id = $1', [id])
    expect(s.owner_id).toBeNull()
    expect(await as('superuser', 'select * from public.space_authorizations where space_id = $1', [id])).toHaveLength(1)
  })

  it('applications require login and accepted terms', async () => {
    await expect(
      as(MERCHANT_A, 'select public.submit_space_application($1, $2)', [JSON.stringify(space()), JSON.stringify({ ...authorization, accepted_terms: false })]),
    ).rejects.toThrow(/terms/)
  })
})

describe('聯絡我們／合作方案', () => {
  const send = (who: string, email = 'brand@example.com') =>
    as(who, `insert into public.contact_inquiries (plan, name, email, message, consent) values ('brand_sponsor', '品牌窗口', $1, '我們想贊助設計師聚會，請問合作方式與時程？', true)`, [email])

  it('anyone can send; only admins can read and update; rate limited per email', async () => {
    await send('anon')
    expect(await as('anon', 'select count(*)::int as n from public.contact_inquiries').catch((e) => String(e))).toMatch(/permission denied/)
    expect(await as(MEMBER, 'select * from public.contact_inquiries')).toHaveLength(0)
    const rows = await as<{ id: string }>(ADMIN, 'select * from public.contact_inquiries')
    expect(rows).toHaveLength(1)
    await as(ADMIN, `update public.contact_inquiries set status = 'replied' where id = $1`, [rows[0].id])
    await send(MEMBER)
    await send('anon')
    await expect(send('anon')).rejects.toThrow(/too many inquiries/)
    await expect(as('anon', `insert into public.contact_inquiries (plan, name, email, message, consent) values ('other', 'x', 'a@b.co', '太短', true)`)).rejects.toThrow(/check constraint/)
    await expect(as('anon', `insert into public.contact_inquiries (plan, name, email, message, consent, status) values ('other', 'x', 'c@b.co', '這是一段超過二十個字的合作洽詢內容內容內容', true, 'closed')`)).rejects.toThrow(/permission denied/)
  })
})

describe('會員推薦空間', () => {
  const add = (who: string, name = '光合作用咖啡') =>
    as(who, `insert into public.space_suggestions (name, city, reason) values ($1, '臺北市', '插座很多又安靜，很適合畫圖')`, [name])
  it('members suggest; only own + admin can read; limited to 5 per day; anon blocked', async () => {
    await add(MEMBER)
    await expect(add('anon')).rejects.toThrow(/permission denied/)
    expect(await as(MEMBER, 'select * from public.space_suggestions')).toHaveLength(1)
    expect(await as(MERCHANT_B, 'select * from public.space_suggestions')).toHaveLength(0)
    const rows = await as<{ id: string }>(ADMIN, 'select * from public.space_suggestions')
    expect(rows).toHaveLength(1)
    await as(ADMIN, `update public.space_suggestions set status = 'contacted' where id = $1`, [rows[0].id])
    await as(MEMBER, `update public.space_suggestions set status = 'listed'`)
    expect((await as<{ status: string }>(ADMIN, 'select status from public.space_suggestions'))[0].status).toBe('contacted')
    for (let i = 0; i < 4; i++) await add(MEMBER, `店 ${i}`)
    await expect(add(MEMBER, '第六家')).rejects.toThrow(/too many suggestions/)
  })
})

describe('私房據點筆記', () => {
  const url = (owner: string) => `https://x.supabase.co/storage/v1/object/public/review-photos/${owner}/n.jpg`
  const add = (who: string, name = '鶯歌老街咖啡') =>
    as<{ id: string }>(who, `insert into public.place_notes (place_name, city, body, tags, photo_urls) values ($1, '新北市', '窗邊有插座，下午很安靜，適合畫插畫兩三個小時。', '{power_ok}', $2) returning id`, [name, [url(who)]])
  it('members post own notes without authorization; public sees visible ones; admin can hide', async () => {
    const [{ id }] = await add(MEMBER)
    expect(await as('anon', 'select * from public.list_place_notes(10)')).toHaveLength(1)
    await expect(as('anon', 'select * from public.place_notes')).rejects.toThrow(/permission denied/)
    await expect(as(MEMBER, `insert into public.place_notes (place_name, body, photo_urls) values ('x', '這是一段超過二十個字的使用心得內容內容內容', $1)`, [[url(MERCHANT_B)]])).rejects.toThrow(/uploaded by the author/)
    await expect(as(MEMBER, `update public.place_notes set status = 'hidden' where id = $1`, [id])).rejects.toThrow(/permission denied/)
    await expect(as(MEMBER, `select public.admin_set_note_status($1, 'hidden', 'x')`, [id])).rejects.toThrow(/admin only/)
    await as(ADMIN, `select public.admin_set_note_status($1, 'hidden', '店家要求移除')`, [id])
    expect(await as('anon', 'select * from public.list_place_notes(10)')).toHaveLength(0)
    // others cannot edit someone else's note
    await as(MERCHANT_B, `update public.place_notes set body = '被改掉的內容被改掉的內容被改掉的內容' where id = $1`, [id])
    const [n] = await as<{ body: string }>(ADMIN, 'select body from public.place_notes where id = $1', [id])
    expect(n.body).toMatch(/窗邊有插座/)
  })
})

describe('最新消息', () => {
  it('public sees only published news; only admins write', async () => {
    await as(ADMIN, `insert into public.site_news (title, body, is_published) values ('DDF 上線', '歡迎加入', true), ('草稿', '未發布', false)`)
    expect(await as('anon', 'select title from public.site_news')).toEqual([{ title: 'DDF 上線' }])
    await expect(as(MEMBER, `insert into public.site_news (title, body) values ('x', 'y')`)).rejects.toThrow(/row-level security/)
    await expect(as('anon', `insert into public.site_news (title, body) values ('x', 'y')`)).rejects.toThrow(/permission denied/)
  })
})

