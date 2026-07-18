const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function formatShanghaiDate(date) {
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10)
}

module.exports = {
  formatShanghaiDate
}
