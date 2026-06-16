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

module.exports = {
  calculateBabyAgeText
}
