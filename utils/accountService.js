const { unwrapCloudResult } = require('./foodService')
const { classifyCloudIssue } = require('./cloudIssue')

const ACCOUNT_SESSION_KEY = 'baby_food_account_session_v1'
const PENDING_SYNC_KEY = 'baby_food_pending_sync_v1'

const LOGGED_OUT_SESSION = Object.freeze({
  loggedIn: false,
  syncStatus: 'idle'
})

function getRuntimeSession() {
  if (typeof getApp !== 'function') return undefined
  try {
    const app = getApp()
    const session = app && app.globalData && app.globalData.accountSession
    return session && typeof session.loggedIn === 'boolean' ? session : undefined
  } catch (error) {
    return undefined
  }
}

function setRuntimeSession(session) {
  if (typeof getApp !== 'function') return
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData.accountSession = session
  } catch (error) {
    // The storage copy remains available when the app instance is unavailable.
  }
}

function createWxStorage() {
  return {
    get(key) {
      if (typeof wx === 'undefined' || !wx.getStorageSync) return undefined
      return wx.getStorageSync(key)
    },
    set(key, value) {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(key, value)
      }
    },
    remove(key) {
      if (typeof wx === 'undefined') return
      if (wx.removeStorageSync) {
        wx.removeStorageSync(key)
      } else if (wx.setStorageSync) {
        wx.setStorageSync(key, undefined)
      }
    }
  }
}

function callCloudFunction(name, data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud is unavailable'))
  }
  return wx.cloud.callFunction({ name, data }).then(unwrapCloudResult)
}

function defaultCallLogin() {
  return callCloudFunction('login', {})
}

function defaultCallAccount(data) {
  return callCloudFunction('accountApi', data)
}

function defaultUploadAvatar(openId, avatarUrl) {
  const source = String(avatarUrl || '').trim()
  if (!source || /^(cloud:\/\/|https?:\/\/)/i.test(source)) {
    return Promise.resolve(source)
  }
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.uploadFile) {
    return Promise.reject(new Error('wx.cloud.uploadFile is unavailable'))
  }
  const pathWithoutQuery = source.split(/[?#]/)[0]
  const extensionMatch = pathWithoutQuery.match(/\.([^.\/]+)$/)
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : ''
  const safeExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? extension : 'jpg'
  const cloudPath = `account-avatars/${openId}/${Date.now()}.${safeExtension}`
  return wx.cloud.uploadFile({ cloudPath, filePath: source }).then((result) => result.fileID)
}

function defaultGetFamily(input) {
  const { getFamilyService } = require('./familyService')
  return getFamilyService().getMyFamily(input)
}

function defaultGetLocalRecords() {
  const { getFoodService } = require('./foodService')
  return getFoodService().getLocalRecordsSnapshot()
}

function defaultMergeLocalRecords(records) {
  const { getFoodService } = require('./foodService')
  return getFoodService().mergeLocalRecords(records)
}

function setDefaultCloudSession(loggedIn) {
  const {
    markLoggedIn,
    markLoggedOut,
    resetFoodService
  } = require('./foodService')
  if (loggedIn) {
    markLoggedIn()
    return
  }
  const { resetFamilyService } = require('./familyService')
  markLoggedOut()
  resetFoodService()
  resetFamilyService()
}

function stableRecordId(record) {
  if (!record || record.id === undefined || record.id === null) return ''
  return String(record.id).trim()
}

function recordUpdatedAt(record) {
  if (!record || !record.updatedAt) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(record.updatedAt)
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function mergePendingRecords(pendingRecords, currentRecords) {
  const merged = []
  const indexesById = new Map()

  function add(record, preferOnEqual) {
    const id = stableRecordId(record)
    if (!id) {
      merged.push(record)
      return
    }
    const existingIndex = indexesById.get(id)
    if (existingIndex === undefined) {
      indexesById.set(id, merged.length)
      merged.push(record)
      return
    }
    const existing = merged[existingIndex]
    const existingTime = recordUpdatedAt(existing)
    const incomingTime = recordUpdatedAt(record)
    if (incomingTime > existingTime || (preferOnEqual && incomingTime === existingTime)) {
      merged[existingIndex] = record
    }
  }

  const previous = Array.isArray(pendingRecords) ? pendingRecords : []
  const current = Array.isArray(currentRecords) ? currentRecords : []
  previous.forEach((record) => add(record, true))
  current.forEach((record) => add(record, true))
  return merged
}

function createAccountService(options = {}) {
  const storage = options.storage || createWxStorage()
  const callLogin = options.callLogin || defaultCallLogin
  const callAccount = options.callAccount || defaultCallAccount
  const uploadAvatar = options.uploadAvatar || defaultUploadAvatar
  const getFamily = options.getFamily || defaultGetFamily
  const getLocalRecords = options.getLocalRecords || defaultGetLocalRecords
  const mergeLocalRecords = options.mergeLocalRecords || defaultMergeLocalRecords
  const setCloudSession = options.setCloudSession || setDefaultCloudSession
  const schedule = options.schedule || ((task) => {
    if (typeof setTimeout === 'function') {
      setTimeout(() => Promise.resolve(task()).catch(() => {}), 0)
      return undefined
    }
    return Promise.resolve().then(task)
  })
  let syncPromise = null
  let currentSession = getRuntimeSession() || storage.get(ACCOUNT_SESSION_KEY) || { ...LOGGED_OUT_SESSION }

  function getSession() {
    return currentSession
  }

  function replaceSession(next) {
    currentSession = next
    setRuntimeSession(next)
    storage.set(ACCOUNT_SESSION_KEY, next)
    return next
  }

  function saveSession(patch) {
    const next = { ...getSession(), ...patch }
    return replaceSession(next)
  }

  function isRemoteAvatar(value) {
    return /^(cloud:\/\/|https?:\/\/)/i.test(String(value || '').trim())
  }

  async function login(profileInput = {}) {
    const nickname = String(profileInput.nickname || '').trim()
    const localAvatarUrl = String(profileInput.avatarUrl || '').trim()
    const profile = await callAccount({
      action: 'saveMyProfile',
      nickname,
      ...(isRemoteAvatar(localAvatarUrl) ? { avatarUrl: localAvatarUrl } : {})
    })
    let openId = profile && (profile.openId || profile.openid || profile.userId)
    if (!openId) {
      const identity = await callLogin()
      openId = identity && (identity.openId || identity.openid || identity.userId)
    }
    if (!openId) throw new Error('登录失败，未取得用户身份')

    const currentRecords = await Promise.resolve(getLocalRecords())
    const existingPending = storage.get(PENDING_SYNC_KEY)
    const records = existingPending && existingPending.openId === openId
      ? mergePendingRecords(existingPending.records, currentRecords)
      : (Array.isArray(currentRecords) ? currentRecords : [])
    const pending = {
      openId,
      nickname,
      avatarUrl: localAvatarUrl,
      records,
      stages: {
        avatar: Boolean(localAvatarUrl && !isRemoteAvatar(localAvatarUrl)),
        family: true,
        food: records.length > 0
      }
    }
    storage.set(PENDING_SYNC_KEY, pending)

    const session = {
      loggedIn: true,
      openId,
      profile: {
        ...profile,
        avatarUrl: localAvatarUrl || (profile && profile.avatarUrl) || ''
      },
      syncStatus: 'pending',
      syncIssue: null
    }
    replaceSession(session)
    await Promise.resolve(setCloudSession(true))
    Promise.resolve(schedule(() => resumePendingSync())).catch(() => {})
    return session
  }

  async function runPendingSync() {
    const session = getSession()
    const pending = storage.get(PENDING_SYNC_KEY)
    if (!session.loggedIn || !pending || pending.openId !== session.openId) {
      return session
    }

    const stages = pending.stages
      ? { avatar: false, family: false, food: false, ...pending.stages }
      : { avatar: false, family: !session.family, food: true }
    let profile = session.profile || {}
    let family = session.family
    let firstError = null

    const avatarTask = stages.avatar
      ? uploadAvatar(session.openId, pending.avatarUrl)
      : Promise.resolve(isRemoteAvatar(profile.avatarUrl) ? profile.avatarUrl : '')
    const familyTask = stages.family
      ? getFamily({
        nickname: pending.nickname || profile.nickname || '',
        avatarUrl: isRemoteAvatar(profile.avatarUrl) ? profile.avatarUrl : ''
      })
      : Promise.resolve(family)
    const [avatarResult, familyResult] = await Promise.allSettled([avatarTask, familyTask])

    if (familyResult.status === 'fulfilled') {
      family = familyResult.value || family
      stages.family = false
    } else {
      firstError = familyResult.reason
    }

    if (avatarResult.status === 'fulfilled' && stages.avatar) {
      try {
        profile = await callAccount({
          action: 'saveMyProfile',
          nickname: pending.nickname || profile.nickname || '',
          avatarUrl: avatarResult.value
        })
        stages.avatar = false
      } catch (error) {
        firstError = firstError || error
      }
    } else if (avatarResult.status === 'rejected') {
      firstError = firstError || avatarResult.reason
    }

    if (stages.food && !stages.family) {
      try {
        await mergeLocalRecords(Array.isArray(pending.records) ? pending.records : [])
        stages.food = false
      } catch (error) {
        firstError = firstError || error
      }
    }

    const hasPending = Object.values(stages).some(Boolean)
    if (hasPending) {
      storage.set(PENDING_SYNC_KEY, { ...pending, stages })
    } else {
      storage.remove(PENDING_SYNC_KEY)
    }

    return saveSession({
      profile,
      family,
      familyLoadError: Boolean(stages.family),
      syncStatus: hasPending ? 'pending' : 'synced',
      syncIssue: firstError ? classifyCloudIssue(firstError) : null
    })
  }

  function resumePendingSync() {
    if (syncPromise) return syncPromise
    syncPromise = runPendingSync().finally(() => {
      syncPromise = null
    })
    return syncPromise
  }

  async function updateProfile(profileInput = {}) {
    const session = getSession()
    if (!session.loggedIn) throw new Error('请先登录')
    const avatarUrl = await uploadAvatar(session.openId, profileInput.avatarUrl)
    const profile = await callAccount({
      action: 'saveMyProfile',
      nickname: profileInput.nickname,
      avatarUrl
    })
    const next = { ...session, profile }
    return replaceSession(next)
  }

  async function retryPendingSync() {
    return resumePendingSync()
  }

  async function refresh() {
    const session = getSession()
    if (!session.loggedIn) return session

    let profile = session.profile
    try {
      profile = await callAccount({ action: 'getMyProfile' }) || profile
    } catch (error) {
      profile = session.profile
    }

    const familyInput = {
      nickname: profile && profile.nickname,
      avatarUrl: profile && profile.avatarUrl
    }
    try {
      const family = await getFamily(familyInput)
      const next = { ...session, profile, family, familyLoadError: false }
      return replaceSession(next)
    } catch (error) {
      const next = { ...session, profile, familyLoadError: true }
      return replaceSession(next)
    }
  }

  function logout() {
    currentSession = { ...LOGGED_OUT_SESSION }
    setRuntimeSession(currentSession)
    storage.remove(ACCOUNT_SESSION_KEY)
    setCloudSession(false)
    return { ...LOGGED_OUT_SESSION }
  }

  return {
    getSession,
    login,
    logout,
    refresh,
    resumePendingSync,
    retryPendingSync,
    updateProfile
  }
}

let singleton

function getAccountService() {
  if (!singleton) singleton = createAccountService()
  return singleton
}

function resetAccountService() {
  singleton = null
}

module.exports = {
  ACCOUNT_SESSION_KEY,
  PENDING_SYNC_KEY,
  createAccountService,
  getAccountService,
  resetAccountService
}
