// DDF original illustrative map. Hand-drawn stylised shapes — NOT derived from any
// government or third-party boundary dataset, and not geographically accurate.
// Positions only suggest the rough relative layout of the four northern cities.
export const MAP_W = 560
export const MAP_H = 380

export const COUNTY_PATHS: Record<string, string> = {
  桃園市: 'M70,200 C80,150 150,120 215,135 C255,145 268,190 258,235 C248,285 210,320 160,318 C110,316 72,290 64,250 C60,232 64,215 70,200 Z',
  新北市: 'M215,135 C235,70 300,30 365,40 C420,48 470,85 488,140 C505,190 480,240 440,270 C400,300 345,320 300,312 C262,305 252,272 258,235 C268,190 255,145 215,135 Z',
  台北市: 'M282,98 C297,73 337,70 354,93 C370,116 362,158 342,176 C322,193 292,186 284,163 C276,143 272,118 282,98 Z',
  基隆市: 'M392,78 C405,66 430,70 435,86 C440,102 425,114 408,112 C392,110 383,91 392,78 Z',
}

/** Final label positions (text anchor = middle). */
export const COUNTY_LABELS: Record<string, [number, number]> = {
  台北市: [318, 214], 新北市: [420, 200], 桃園市: [150, 282], 基隆市: [452, 66],
}

/** Illustrative "creative hotspot" points — hand-placed, not real coordinates. */
export const NODES: Record<string, [number, number]> = {
  台北市士林區: [318, 96], 台北市中山區: [312, 124], 台北市松山區: [334, 122], 台北市內湖區: [347, 106],
  台北市信義區: [338, 152], 台北市大安區: [318, 156], 台北市萬華區: [296, 146],
  新北市淡水區: [276, 66], 新北市三重區: [268, 126], 新北市新莊區: [248, 152], 新北市板橋區: [276, 182],
  新北市新店區: [322, 236], 新北市汐止區: [380, 122], 新北市林口區: [236, 104],
  桃園市龜山區: [214, 176], 桃園市桃園區: [186, 200], 桃園市蘆竹區: [176, 162], 桃園市大園區: [128, 172],
  桃園市八德區: [198, 240], 桃園市中壢區: [140, 236],
  基隆市仁愛區: [412, 92],
}
