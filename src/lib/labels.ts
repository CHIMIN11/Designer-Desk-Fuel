export const CATEGORY: Record<string, string> = {
  cafe: '咖啡店',
  coworking: '共享工作空間',
  studio: '工作室',
  library: '圖書館',
  other: '其他',
}

export const PRICE: Record<string, string> = {
  under_200: 'NT$200 以下',
  '200_400': 'NT$200–400',
  over_400: 'NT$400 以上',
}

export const POWER: Record<string, string> = {
  none: '無插座',
  some: '部分座位有插座',
  most: '多數座位有插座',
  all: '每個座位都有插座',
}

export const AUTH_STATUS: Record<string, string> = {
  pending: '審核中',
  approved: '已授權',
  rejected: '未通過',
  withdrawn: '已撤回',
  expired: '授權已過期',
}

export const PUB_STATUS: Record<string, string> = {
  draft: '未上架',
  published: '已公開',
  suspended: '已暫停',
  removed: '已撤下',
}

export const CITIES = ['台北市', '新北市', '桃園市', '新竹市', '台中市', '高雄市']

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
