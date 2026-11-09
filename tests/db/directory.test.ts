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

  it('members cannot hide reviews', async () => {
    const id = await publishFully()
    const [{ id: rid }] = await post(MEMBER, id) as { id: string }[]
    await expect(as(MERCHANT_A, `select public.admin_set_review_status($1, 'hidden', 'x')`, [rid])).rejects.toThrow(/admin only/)
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
