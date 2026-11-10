import { useState } from 'react'

export const PROFESSIONS = ['UI／UX 設計師', '平面設計師', '品牌設計師', '插畫師', '產品／工業設計師', '網頁設計師', '動態設計師', '3D 設計師', '室內／空間設計師', '攝影師', '影像創作者', '文案／內容創作者', '設計學生', '自由工作者']
export const REGIONS = ['臺北市', '新北市', '桃園市', '基隆市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣', '海外']
export const SKILLS = ['Figma', 'Adobe Illustrator', 'Photoshop', 'InDesign', 'After Effects', 'Premiere Pro', 'Blender', 'Cinema 4D', 'Procreate', 'Framer', 'Webflow', 'Midjourney', 'UI 設計', 'UX 研究', '品牌設計', '字體設計', '插畫', '排版', '包裝設計', '動態設計', '3D 建模', '攝影', '簡報設計', '前端開發']

/** Dropdown with an "其他" option that reveals a free-text input. */
export function SelectOrOther({ label, options, value, onChange, maxLength, placeholder }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void; maxLength: number; placeholder?: string
}) {
  const isCustom = value !== '' && !options.includes(value)
  const [other, setOther] = useState(isCustom)
  const sel = other ? '__other' : value
  return (
    <label className="field">{label}
      <select value={sel} onChange={(e) => {
        if (e.target.value === '__other') { setOther(true); onChange('') } else { setOther(false); onChange(e.target.value) }
      }}>
        <option value="">— 請選擇 —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__other">其他（自行輸入）</option>
      </select>
      {other && <input autoFocus maxLength={maxLength} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 8 }} />}
    </label>
  )
}

/** Multi-select chips with suggestions plus custom entries. */
export function SkillPicker({ value, onChange, max = 12 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [draft, setDraft] = useState('')
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : value.length < max ? [...value, s] : value)
  const add = () => {
    const s = draft.trim().slice(0, 30)
    if (s && !value.includes(s) && value.length < max) onChange([...value, s])
    setDraft('')
  }
  const extras = value.filter((v) => !SKILLS.includes(v))
  return (
    <fieldset className="field skill-picker">
      <legend>技能（可複選，最多 {max} 項）<span className="hint"> 已選 {value.length}/{max}</span></legend>
      <div className="chip-row">
        {[...SKILLS, ...extras].map((s) => (
          <button key={s} type="button" className={`chip${value.includes(s) ? ' on' : ''}`} aria-pressed={value.includes(s)}
            disabled={!value.includes(s) && value.length >= max} onClick={() => toggle(s)}>{s}</button>
        ))}
      </div>
      <div className="skill-add">
        <input maxLength={30} placeholder="沒有你的技能？自行新增" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add() } }} />
        <button type="button" className="btn btn-pill-outline" onClick={add} disabled={!draft.trim() || value.length >= max}>新增</button>
      </div>
    </fieldset>
  )
}
