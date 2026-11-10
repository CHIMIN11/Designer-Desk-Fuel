import { supabase } from './supabase'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function checkImage(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `「${file.name}」格式不支援，請用 JPG、PNG 或 WebP。`
  if (file.size > MAX_IMAGE_BYTES) return `「${file.name}」超過 5 MB，請先壓縮再上傳。`
  return null
}

/**
 * Uploads a listing image to <user id>/<space id>/<random>.<ext> in the
 * "space-assets" bucket and returns its public URL. Storage policies only allow
 * writing inside the signed-in member's own folder.
 */
export async function uploadSpaceImage(file: File, userId: string, spaceId: string): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${spaceId}/${crypto.randomUUID()}.${ext}`
  const bucket = supabase!.storage.from('space-assets')
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return bucket.getPublicUrl(path).data.publicUrl
}
