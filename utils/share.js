const DEFAULT_SHARE_TITLE = '这还能吃吗｜宝宝食材小管家'
const HOME_PATH = '/pages/index/index'

const shareableRouteQueryKeys = Object.freeze({
  'pages/index/index': [],
  'pages/food/search': ['keyword'],
  'pages/food/name-search': ['keyword'],
  'pages/purchase-plan/index': [],
  'pages/quick-process/index': [],
  'pages/recognize/index': [],
  'pages/reminder/index': [],
  'pages/mine/index': [],
  'pages/feedback/index': [],
  'pages/about/index': []
})

function normalizeRoute(route) {
  return String(route || '').replace(/^\/+/, '')
}

function encodeQuery(options, allowedKeys) {
  const source = options && typeof options === 'object' ? options : {}
  return allowedKeys.reduce((parts, key) => {
    const value = source[key]
    if (value === undefined || value === null || value === '') return parts
    if (!['string', 'number', 'boolean'].includes(typeof value)) return parts
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    return parts
  }, []).join('&')
}

function readPageContext(page) {
  if (page && page.route) {
    return { route: page.route, options: page.options || {} }
  }
  try {
    if (typeof getCurrentPages !== 'function') return {}
    const pages = getCurrentPages()
    const current = pages && pages[pages.length - 1]
    return current
      ? { route: current.route || '', options: current.options || {} }
      : {}
  } catch (error) {
    return {}
  }
}

function buildShareQuery(context) {
  const route = normalizeRoute(context && context.route)
  const allowedKeys = shareableRouteQueryKeys[route]
  if (!allowedKeys) return ''
  return encodeQuery(context && context.options, allowedKeys)
}

function buildSharePath(context) {
  const route = normalizeRoute(context && context.route)
  const allowedKeys = shareableRouteQueryKeys[route]
  if (!allowedKeys) return HOME_PATH
  const query = encodeQuery(context && context.options, allowedKeys)
  return `/${route}${query ? `?${query}` : ''}`
}

function createShareHandlers(options = {}) {
  const title = options.title || DEFAULT_SHARE_TITLE
  const handlers = {
    onShareAppMessage() {
      return {
        title,
        path: buildSharePath(readPageContext(this))
      }
    }
  }
  if (options.timeline === true) {
    handlers.onShareTimeline = function onShareTimeline() {
      return {
        title,
        query: buildShareQuery(readPageContext(this))
      }
    }
  }
  return handlers
}

module.exports = {
  DEFAULT_SHARE_TITLE,
  HOME_PATH,
  shareableRouteQueryKeys,
  encodeQuery,
  readPageContext,
  buildShareQuery,
  buildSharePath,
  createShareHandlers
}
