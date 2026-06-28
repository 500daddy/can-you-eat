const { todayString } = require('./foodRules')

function parseLocalDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addMonths(date, months) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const targetMonth = next.getMonth() + months
  next.setMonth(targetMonth)
  if (next.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    next.setDate(0)
  }
  return next
}

function daysBetween(from, to) {
  const start = parseLocalDate(from)
  const end = parseLocalDate(to)
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
}

function calculateBabyAgeText(birthday, today = todayString()) {
  if (!birthday) return ''
  const birth = parseLocalDate(birthday)
  const current = parseLocalDate(today)
  if (current < birth) return '0天'

  let months = (current.getFullYear() - birth.getFullYear()) * 12 + current.getMonth() - birth.getMonth()
  let anchor = addMonths(birth, months)
  if (anchor > current) {
    months -= 1
    anchor = addMonths(birth, months)
  }

  const days = Math.max(0, Math.round((current.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000)))
  if (months <= 0) return `${daysBetween(birthday, today)}天`
  return `${months}个月${days}天`
}

function calculateBabyAgeMonths(birthday, today = todayString()) {
  if (!birthday) return 0
  const birth = parseLocalDate(birthday)
  const current = parseLocalDate(today)
  if (current < birth) return 0

  let months = (current.getFullYear() - birth.getFullYear()) * 12 + current.getMonth() - birth.getMonth()
  if (addMonths(birth, months) > current) {
    months -= 1
  }
  return Math.max(0, months)
}

function normalizeBabyAgeMonths(value) {
  const months = Math.max(0, Math.round(Number(value) || 0))
  if (months < 24) return months
  return Math.max(24, Math.round(months / 6) * 6)
}

function formatBabyAgeFromMonths(value) {
  const months = normalizeBabyAgeMonths(value)
  if (months < 24) return `${months}个月`
  const years = Math.floor(months / 12)
  return months % 12 >= 6 ? `${years}岁半` : `${years}岁`
}

function getBabyAgePickerOptions(maxMonths = 72) {
  const options = []
  for (let months = 0; months < 24; months += 1) {
    options.push({ months, text: formatBabyAgeFromMonths(months) })
  }
  for (let months = 24; months <= maxMonths; months += 6) {
    options.push({ months, text: formatBabyAgeFromMonths(months) })
  }
  return options
}

module.exports = {
  calculateBabyAgeText,
  calculateBabyAgeMonths,
  formatBabyAgeFromMonths,
  getBabyAgePickerOptions,
  normalizeBabyAgeMonths
}
