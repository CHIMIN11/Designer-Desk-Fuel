import { useEffect, useMemo, useRef, useState } from 'react'
import { checkImage } from '../lib/upload'
import Icon from './Icon'

/** Pick up to `max` images with previews. Files are only uploaded by the parent on submit. */
export default function ImagePicker({ label, max, files, onChange }: { label: string; max: number; files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const add = (list: FileList | null) => {
    if (!list) return
    setError('')
    const next = [...files]
    for (const f of Array.from(list)) {
      const problem = checkImage(f)
      if (problem) { setError(problem); continue }
      if (next.length >= max) { setError(`最多 ${max} 張。`); break }
      next.push(f)
    }
    onChange(next)
    if (input.current) input.current.value = ''
  }

  return (
    <div className="picker">
      <p className="picker-label">{label}<span>（{files.length}/{max}，JPG／PNG／WebP，每張 5 MB 內）</span></p>
      <div className="picker-grid">
        {previews.map((src, i) => (
          <div key={src} className="picker-item">
            <img src={src} alt={`已選擇的圖片 ${i + 1}`} />
            <button type="button" aria-label={`移除第 ${i + 1} 張`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
              <Icon name="close" size={16} stroke={2.2} />
            </button>
          </div>
        ))}
        {files.length < max && (
          <button type="button" className="picker-add" onClick={() => input.current?.click()}>
            <Icon name="plus" size={26} stroke={1.6} />
            <span>新增圖片</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} hidden onChange={(e) => add(e.target.files)} />
      {error && <p className="notice notice-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  )
}
