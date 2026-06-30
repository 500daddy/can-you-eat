const PLACEHOLDER_TEMPLATE_ID = '请替换为实际订阅消息模板ID'
const DEFAULT_PAGE = 'pages/reminder/index'

function loadLocalConfig() {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env.BABY_FOOD_IGNORE_LOCAL_CONFIG === '1'
  ) {
    return {}
  }
  try {
    return require('./subscribeConfig.local')
  } catch (error) {
    return {}
  }
}

const localConfig = loadLocalConfig()
const TEMPLATE_ID_FOOD_EXPIRE = localConfig.TEMPLATE_ID_FOOD_EXPIRE || PLACEHOLDER_TEMPLATE_ID

function isTemplateConfigured(templateId) {
  return Boolean(templateId && templateId !== PLACEHOLDER_TEMPLATE_ID)
}

function todayString() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function parseDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function daysBetween(from, to) {
  const start = parseDate(from)
  const end = parseDate(to)
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
}

function truncate(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeReminderCandidate(record, today = todayString()) {
  if (!record) return null
  const expireDate = record.babyExpireDate || record.adultExpireDate || today
  return {
    foodName: record.foodName || record.name || record.customFoodName || '自定义食材',
    remainingDays: Math.max(0, daysBetween(today, expireDate)),
    expireDate
  }
}

function selectReminderCandidate(reminders = {}, today = todayString()) {
  const record = [
    ...(reminders.today || []),
    ...(reminders.soon || []),
    ...(reminders.overdue || [])
  ][0]
  return normalizeReminderCandidate(record, today)
}

function buildReminderMessagePayload(options = {}) {
  const remainingDays = Math.max(0, Number(options.remainingDays ?? 1) || 0)
  return {
    touser: options.touser,
    templateId: options.templateId || TEMPLATE_ID_FOOD_EXPIRE,
    page: options.page || DEFAULT_PAGE,
    miniprogramState: options.miniprogramState || 'developer',
    data: {
      thing6: { value: truncate(options.foodName || '西兰花', 20) },
      number2: { value: String(remainingDays) },
      time16: { value: truncate(options.expireDate || todayString(), 20) }
    }
  }
}

function createSendFoodReminder(options = {}) {
  const getOpenId = options.getOpenId || (() => '')
  const sendSubscribeMessage = options.sendSubscribeMessage
  const getReminderCandidate = options.getReminderCandidate

  return async function sendFoodReminder(event = {}) {
    const touser = event.touser || getOpenId()
    if (!touser) {
      return { ok: false, error: 'missing_openid' }
    }
    if (!sendSubscribeMessage) {
      return { ok: false, error: 'missing_sender' }
    }
    const templateId = event.templateId || options.templateId || TEMPLATE_ID_FOOD_EXPIRE
    if (!isTemplateConfigured(templateId)) {
      return { ok: false, error: 'template_not_configured' }
    }
    const reminderCandidate = event.foodName || !getReminderCandidate
      ? null
      : await getReminderCandidate({ touser, event })
    if (getReminderCandidate && !event.foodName && !reminderCandidate) {
      return { ok: false, error: 'no_reminder' }
    }

    const payload = buildReminderMessagePayload({
      touser,
      templateId,
      foodName: event.foodName || (reminderCandidate && reminderCandidate.foodName),
      remainingDays: event.remainingDays ?? (reminderCandidate && reminderCandidate.remainingDays),
      expireDate: event.expireDate || (reminderCandidate && reminderCandidate.expireDate),
      miniprogramState: event.miniprogramState
    })
    const response = await sendSubscribeMessage(payload)
    const errCode = response && (response.errCode ?? response.errcode ?? 0)
    if (errCode) {
      return {
        ok: false,
        error: response.errMsg || response.errmsg || `subscribe message failed: ${errCode}`,
        data: response
      }
    }
    return { ok: true, data: response }
  }
}

module.exports = {
  buildReminderMessagePayload,
  createSendFoodReminder,
  normalizeReminderCandidate,
  PLACEHOLDER_TEMPLATE_ID,
  selectReminderCandidate,
  TEMPLATE_ID_FOOD_EXPIRE
}
