/** Quick-entry widgets shared by the space forms (store application, merchant, admin). */

export const DISTRICTS: Record<string, string[]> = {
  台北市: ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
  新北市: ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '樹林區', '汐止區', '鶯歌區', '三峽區', '淡水區', '瑞芳區', '五股區', '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區', '雙溪區', '貢寮區', '金山區', '萬里區', '烏來區'],
  桃園市: ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龜山區', '大園區', '龍潭區', '新屋區', '觀音區', '復興區'],
  新竹市: ['東區', '北區', '香山區'],
  台中市: ['中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '太平區', '大里區', '霧峰區', '烏日區', '豐原區', '后里區', '石岡區', '東勢區', '和平區', '新社區', '潭子區', '大雅區', '神岡區', '大肚區', '沙鹿區', '龍井區', '梧棲區', '清水區', '大甲區', '外埔區', '大安區'],
  高雄市: ['新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '旗津區', '前鎮區', '三民區', '楠梓區', '小港區', '左營區', '仁武區', '大社區', '岡山區', '路竹區', '阿蓮區', '田寮區', '燕巢區', '橋頭區', '梓官區', '彌陀區', '永安區', '湖內區', '鳳山區', '大寮區', '林園區', '鳥松區', '大樹區', '旗山區', '美濃區', '六龜區', '內門區', '杉林區', '甲仙區', '桃源區', '那瑪夏區', '茂林區', '茄萣區'],
}

export const YES_NO: [string, string][] = [['yes', '有'], ['no', '沒有'], ['', '不確定']]

/** One-tap pill choice. '' is "unknown / not provided". */
export function Segmented({ label, value, onChange, options = YES_NO }: {
  label: string; value: string; onChange: (v: string) => void; options?: [string, string][]
}) {
  return (
    <div className="field seg-field" role="radiogroup" aria-label={label}>
      <span className="seg-label">{label}</span>
      <div className="seg">
        {options.map(([v, l]) => (
          <button key={v || 'none'} type="button" role="radio" aria-checked={value === v}
            className={`seg-btn${value === v ? ' on' : ''}${v === '' ? ' muted' : ''}`} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  )
}

/** District dropdown for the selected city, with a free-text fallback. */
export function DistrictPicker({ city, value, onChange }: { city: string; value: string; onChange: (v: string) => void }) {
  const list = DISTRICTS[city]
  if (!list) return <label className="field">行政區<input maxLength={40} value={value} onChange={(e) => onChange(e.target.value)} /></label>
  return (
    <label className="field">行政區
      <select value={list.includes(value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— 請選擇 —</option>
        {list.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </label>
  )
}

/** Textarea with tap-to-insert phrases. */
export function QuickText({ label, value, onChange, chips, placeholder, max = 500 }: {
  label: string; value: string; onChange: (v: string) => void; chips: string[]; placeholder?: string; max?: number
}) {
  const add = (c: string) => {
    if (value.includes(c)) return
    const next = value.trim() ? `${value.trim().replace(/[，,。]$/, '')}，${c}` : c
    onChange(next.slice(0, max))
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div className="quick-chips" aria-label={`${label}快速填入`}>
        {chips.map((c) => <button key={c} type="button" className={`chip${value.includes(c) ? ' on' : ''}`} onClick={() => add(c)}>＋ {c}</button>)}
      </div>
      <textarea aria-label={label} maxLength={max} rows={3} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export const HOURS_CHIPS = ['每日 10:00–22:00', '週一至週五 09:00–18:00', '週末 10:00–20:00', '週一公休', '週二公休', '不限用餐時間', '平日不限時、假日限 2 小時', '用餐限時 2 小時']
export const SEATING_CHIPS = ['單人吧台座', '雙人桌', '四人桌', '長桌／共享大桌', '沙發區', '靠窗座位', '戶外座位', '包廂／會議室', '安靜區']
