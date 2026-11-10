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

/** Uploads review photos to review-photos/<user id>/<random>.<ext>; returns their public URLs. */
export async function uploadReviewPhotos(files: File[], userId: string): Promise<string[]> {
  const bucket = supabase!.storage.from('review-photos')
  const urls: string[] = []
  for (const file of files) {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/${crypto.randomUUID()}.${ext}`
    const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false })
    if (error) {
      await deleteReviewPhotos(urls)
      throw error
    }
    urls.push(bucket.getPublicUrl(path).data.publicUrl)
  }
  return urls
}

/** Best-effort removal of review photo files (by public URL). */
export async function deleteReviewPhotos(urls: string[]): Promise<void> {
  const marker = '/storage/v1/object/public/review-photos/'
  const paths = urls.map((u) => u.split(marker)[1]).filter(Boolean)
  if (paths.length) await supabase!.storage.from('review-photos').remove(paths)
}
