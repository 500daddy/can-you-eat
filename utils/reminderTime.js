const DEFAULT_DAILY_SUMMARY_TIME = '08:00'

const DAILY_SUMMARY_TIME_OPTIONS = [
  { value: '08:00', label: '早上 8 点' },
  { value: '10:00', label: '上午 10 点' },
  { value: '12:00', label: '中午 12 点' },
  { value: '20:00', label: '晚上 8 点' }
]

function normalizeDailySummaryTime(value) {
  const text = String(value || '').trim()
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return text
  return DEFAULT_DAILY_SUMMARY_TIME
}

function formatDailySummaryTime(value) {
  const time = normalizeDailySummaryTime(value)
  const matched = DAILY_SUMMARY_TIME_OPTIONS.find((item) => item.value === time)
  return matched ? matched.label : time
}

function buildDailySummaryTimeOptions(value) {
  const time = normalizeDailySummaryTime(value)
  return DAILY_SUMMARY_TIME_OPTIONS.map((item) => ({
    ...item,
    selected: item.value === time
  }))
}

function buildDailySummaryTimeState(value) {
  const dailyTime = normalizeDailySummaryTime(value)
  return {
    dailyTime,
    dailyTimeText: formatDailySummaryTime(dailyTime),
    dailyTimeOptions: buildDailySummaryTimeOptions(dailyTime)
  }
}

module.exports = {
  DAILY_SUMMARY_TIME_OPTIONS,
  DEFAULT_DAILY_SUMMARY_TIME,
  buildDailySummaryTimeOptions,
  buildDailySummaryTimeState,
  formatDailySummaryTime,
  normalizeDailySummaryTime
}
