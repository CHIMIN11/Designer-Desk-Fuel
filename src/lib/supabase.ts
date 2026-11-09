import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True only when real Supabase credentials are present. The UI never fakes data when false. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT-REF'))

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, anonKey!) : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('尚未連接 Supabase：請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。')
  return supabase
}

/** Turns Postgres/RPC errors into short Traditional Chinese messages. */
export function errorText(err: unknown): string {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  const map: [RegExp, string][] = [
    [/login required/, '請先登入。'],
    [/admin only/, '僅限管理員操作。'],
    [/not the manager/, '你沒有管理這個空間的權限。'],
    [/terms must be accepted/, '請先閱讀並同意刊登授權條款。'],
    [/too many pending applications/, '你已有 3 筆審核中的申請，請等待審核完成。'],
    [/too many pending update requests/, '這個空間已有 5 筆待審核的更新申請。'],
    [/valid approved authorization/, '尚未取得有效授權，無法上架。'],
    [/must be verified/, '資料尚未核對或已過複查日期，無法上架。'],
    [/DEMO data/, 'DEMO 資料不可上架。'],
    [/reason is required/, '請填寫原因。'],
    [/evidence reference is required/, '核准前請填寫授權證明編號或說明。'],
    [/future expiry date/, '請設定未來的授權到期日。'],
    [/violates check constraint/, '有欄位格式不正確（網址需以 https:// 開頭、Email 需正確）。'],
    [/cannot be changed by the business/, '這個欄位不能由店家修改。'],
  ]
  for (const [re, text] of map) if (re.test(msg)) return text
  return msg
}
