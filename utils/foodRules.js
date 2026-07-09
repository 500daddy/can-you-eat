const { getStatus } = require('./status')

const DAY_MS = 24 * 60 * 60 * 1000

const storageTextMap = {
  room: '常温保存',
  fridge: '冷藏保存',
  freezer: '冷冻保存'
}

const statusGroupMap = {
  baby_today: '今天建议处理',
  adult_only: '可留给大人吃',
  not_recommended: '不建议继续食用',
  expired: '不建议继续食用',
  baby_ok: '新鲜食材',
  finished: '已处理',
  deleted: '已删除'
}

const statusPriority = {
  baby_today: 0,
  adult_only: 1,
  not_recommended: 2,
  expired: 3,
  baby_ok: 4,
  finished: 5,
  deleted: 6
}

const manualStatusSet = new Set(['not_recommended', 'finished', 'deleted'])

function parseLocalDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayString() {
  return formatDate(new Date())
}

function addDays(value, days) {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + Number(days || 0))
  return formatDate(date)
}

function daysBetween(from, to) {
  const start = parseLocalDate(from)
  const end = parseLocalDate(to)
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

function leftText(days, overdueText) {
  if (days > 0) return `剩${days}天`
  if (days === 0) return '今天到期'
  return overdueText
}

function normalizeAllergens(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(value || '').split(/[、,，\s]/).map((item) => item.trim()).filter(Boolean)
}

function foodAllergenText(food) {
  return [
    food && food.name,
    food && food.aliases,
    food && food.category,
    food && food.subCategory
  ].flatMap((item) => Array.isArray(item) ? item : String(item || '').split(/[、,，\s]/))
    .join(' ')
}

function getMatchedAllergens(food, babyAllergens) {
  const searchText = foodAllergenText(food)
  return normalizeAllergens(babyAllergens).filter((allergen) => searchText.includes(allergen))
}

function noteForStatus(status, matchedAllergens = []) {
  if (matchedAllergens.length) return `包含宝宝过敏源：${matchedAllergens.join('、')}，请不要给宝宝食用。`
  if (status === 'baby_today') return '今天优先做熟食用'
  if (status === 'adult_only') return '可留给大人结合状态判断'
  if (status === 'expired') return '已超过参考期，建议谨慎处理'
  if (status === 'not_recommended') return '如有出水或异味请处理'
  if (status === 'finished') return '这条记录已处理'
  return '当前仍在宝宝建议期内'
}

function resolveRange(food, storageMethod) {
  const range = food && food[storageMethod]
  if (range) return range
  return (food && food[food.defaultStorage]) || {
    babyDaysMax: 1,
    adultDaysMax: 2
  }
}

function calculateRecordState(options) {
  const {
    food,
    purchaseDate,
    storageMethod = food && food.defaultStorage ? food.defaultStorage : 'fridge',
    status,
    today = todayString(),
    remindBeforeDays = 1,
    babyAllergens = []
  } = options
  const range = resolveRange(food, storageMethod)
  const babyExpireDate = addDays(purchaseDate, range.babyDaysMax)
  const adultExpireDate = addDays(purchaseDate, range.adultDaysMax)
  const remindDate = addDays(babyExpireDate, -remindBeforeDays)
  const daysToBaby = daysBetween(today, babyExpireDate)
  const daysToAdult = daysBetween(today, adultExpireDate)
  let nextStatus = status
  const matchedAllergens = getMatchedAllergens(food, babyAllergens)

  if (nextStatus === 'adult_only') {
    nextStatus = daysToAdult >= 0 ? 'adult_only' : 'expired'
  } else if (!manualStatusSet.has(nextStatus)) {
    if (matchedAllergens.length) {
      nextStatus = 'not_recommended'
    } else if (daysToBaby >= 2) {
      nextStatus = 'baby_ok'
    } else if (daysToBaby >= 0) {
      nextStatus = 'baby_today'
    } else if (daysToAdult >= 0) {
      nextStatus = 'adult_only'
    } else {
      nextStatus = 'expired'
    }
  }

  const statusInfo = getStatus(nextStatus)
  const savedDays = Math.max(0, daysBetween(purchaseDate, today))

  return {
    status: nextStatus,
    statusText: statusInfo.text,
    statusShortText: statusInfo.shortText,
    storageText: storageTextMap[storageMethod] || '冷藏保存',
    babyExpireDate,
    adultExpireDate,
    remindDate,
    savedDays: `${savedDays}天`,
    babyLeft: leftText(daysToBaby, '已超过宝宝建议期'),
    adultLeft: leftText(daysToAdult, '已超过参考期'),
    group: statusGroupMap[nextStatus] || '新鲜食材',
    note: noteForStatus(nextStatus, matchedAllergens),
    riskNote: matchedAllergens.length ? noteForStatus(nextStatus, matchedAllergens) : ''
  }
}

function sortRecordsByPriority(records) {
  return [...records].sort((a, b) => {
    const priorityDiff = (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99)
    if (priorityDiff) return priorityDiff
    return daysBetween('1970-01-01', a.babyExpireDate || '2999-12-31') -
      daysBetween('1970-01-01', b.babyExpireDate || '2999-12-31')
  })
}

function groupRecords(records) {
  const groups = [
    '今天建议处理',
    '可留给大人吃',
    '不建议继续食用',
    '新鲜食材'
  ]
  return groups
    .map((title) => ({
      title,
      items: sortRecordsByPriority(records.filter((item) => item.group === title))
    }))
    .filter((section) => section.items.length)
}

module.exports = {
  addDays,
  calculateRecordState,
  daysBetween,
  formatDate,
  groupRecords,
  sortRecordsByPriority,
  storageTextMap,
  todayString
}
