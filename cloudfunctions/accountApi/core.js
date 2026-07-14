function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function matchesDocument(document) {
  if (document._id) {
    return (item) => item._id === document._id
  }
  return (item) => item.id === document.id
}

function toProfile(document) {
  if (!document) return null
  return {
    id: document.id,
    openId: document.openId,
    nickname: document.nickname,
    avatarUrl: document.avatarUrl,
    profileUpdatedAt: document.profileUpdatedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  }
}

async function getProfile(store, userId) {
  if (typeof store.getByFields === 'function') {
    return store.getByFields('user_profiles', { openId: userId })
  }
  return store.get('user_profiles', (item) => item.openId === userId)
}

function createAccountApi({ store, userId, today = formatDate(new Date()) }) {
  return {
    async handle(event = {}) {
      try {
        if (event.action === 'getMyProfile') {
          const profile = await getProfile(store, userId)
          return { ok: true, data: toProfile(profile) }
        }

        if (event.action === 'saveMyProfile') {
          const nickname = String(event.nickname ?? '').trim()
          if (!nickname) {
            return { ok: false, error: '请输入家长昵称' }
          }
          const existing = await getProfile(store, userId)
          const hasAvatar = event.avatarUrl !== undefined && event.avatarUrl !== null
          const avatarUrl = hasAvatar
            ? String(event.avatarUrl).trim()
            : String((existing && existing.avatarUrl) || '')
          const profilePatch = {
            nickname,
            ...(hasAvatar ? { avatarUrl } : {}),
            profileUpdatedAt: today,
            updatedAt: today
          }
          const profile = {
            id: `profile_${userId}`,
            openId: userId,
            avatarUrl,
            ...profilePatch,
            createdAt: existing && existing.createdAt ? existing.createdAt : today
          }

          if (existing) {
            if (typeof store.updateByDocumentId === 'function') {
              await store.updateByDocumentId(
                'user_profiles',
                existing._id || profile.id,
                profilePatch
              )
            } else {
              await store.update('user_profiles', matchesDocument(existing), profilePatch)
            }
          } else if (typeof store.setByDocumentId === 'function') {
            await store.setByDocumentId('user_profiles', profile.id, profile)
          } else {
            await store.add('user_profiles', profile)
          }

          const memberFields = { openId: userId, status: 'active' }
          const memberPatch = {
            nickname,
            ...(hasAvatar ? { avatarUrl } : {}),
            updatedAt: today
          }
          if (typeof store.updateManyByFields === 'function') {
            await store.updateManyByFields('family_members', memberFields, memberPatch)
          } else {
            const isCurrentActiveMember = (item) => (
              item.openId === userId && item.status === 'active'
            )
            const memberships = await store.list('family_members', isCurrentActiveMember)
            for (const membership of memberships) {
              const isSameMember = matchesDocument(membership)
              await store.update(
                'family_members',
                (item) => isSameMember(item) && isCurrentActiveMember(item),
                memberPatch
              )
            }
          }

          return { ok: true, data: profile }
        }

        return { ok: false, error: `Unknown action: ${event.action || 'empty'}` }
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : String(error) }
      }
    }
  }
}

module.exports = {
  createAccountApi
}
