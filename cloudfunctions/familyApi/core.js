function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

const rolePermissions = {
  owner: new Set(['edit_food_records', 'manage_purchase_plans', 'invite_members', 'manage_members', 'edit_baby_settings', 'dissolve_family']),
  admin: new Set(['edit_food_records', 'manage_purchase_plans', 'invite_members']),
  member: new Set(['edit_food_records', 'manage_purchase_plans'])
}

const fallbackCollections = new WeakMap()

function isMissingCollectionError(error) {
  return error instanceof TypeError && String(error.message || '').includes('undefined')
}

function fallbackCollection(store, collection) {
  let collections = fallbackCollections.get(store)
  if (!collections) {
    collections = new Map()
    fallbackCollections.set(store, collections)
  }
  if (!collections.has(collection)) {
    collections.set(collection, [])
  }
  return collections.get(collection)
}

async function listItems(store, collection, predicate = () => true) {
  try {
    return await store.list(collection, predicate)
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    return fallbackCollection(store, collection).filter(predicate)
  }
}

async function getItem(store, collection, predicate) {
  try {
    return await store.get(collection, predicate)
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    return fallbackCollection(store, collection).find(predicate) || null
  }
}

async function addItem(store, collection, doc) {
  try {
    return await store.add(collection, doc)
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    const next = { ...doc, _id: doc._id || doc.id || makeId(collection) }
    fallbackCollection(store, collection).push(next)
    return { ...next }
  }
}

async function updateItem(store, collection, predicate, patch) {
  try {
    return await store.update(collection, predicate, patch)
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    let updated = null
    const collectionItems = fallbackCollection(store, collection)
    for (let index = 0; index < collectionItems.length; index += 1) {
      const item = collectionItems[index]
      if (!predicate(item)) continue
      updated = { ...item, ...patch }
      collectionItems[index] = updated
      break
    }
    return updated ? { ...updated } : null
  }
}

async function moveUserFamilyData(store, userId, fromFamilyId, toFamilyId) {
  const records = await listItems(store, 'user_food_records', (item) => item.familyId === fromFamilyId && item.userId === userId)
  for (const record of records) {
    await updateItem(store, 'user_food_records', (item) => item._id === record._id || item.id === record.id, {
      familyId: toFamilyId
    })
  }
}

function roleCan(role, permission) {
  return Boolean(rolePermissions[role] && rolePermissions[role].has(permission))
}

async function getActiveMembership(store, userId) {
  return getItem(store, 'family_members', (item) => item.openId === userId && item.status === 'active')
}

function addDays(day, days) {
  const date = new Date(`${day}T00:00:00`)
  date.setDate(date.getDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

async function requireMembership(store, userId) {
  const membership = await getActiveMembership(store, userId)
  if (!membership) throw new Error('请先加入家庭')
  return membership
}

async function requirePermission(store, userId, permission) {
  const membership = await requireMembership(store, userId)
  if (!roleCan(membership.role, permission)) throw new Error('当前身份没有权限进行此操作')
  return membership
}

async function ensureDefaultFamily(store, userId, today, input = {}) {
  const existing = await getActiveMembership(store, userId)
  if (existing) {
    const family = await getItem(store, 'families', (item) => item.familyId === existing.familyId && item.status === 'active')
    return { family, membership: existing }
  }
  const familyId = makeId('family')
  const family = await addItem(store, 'families', {
    id: familyId,
    familyId,
    name: input.name || '宝宝的小厨房',
    ownerOpenId: userId,
    createdBy: userId,
    status: 'active',
    createdAt: today,
    updatedAt: today
  })
  const membership = await addItem(store, 'family_members', {
    id: makeId('member'),
    familyId,
    openId: userId,
    nickname: input.nickname || '',
    avatarUrl: input.avatarUrl || '',
    role: 'owner',
    status: 'active',
    joinedAt: today,
    updatedAt: today
  })
  return { family, membership }
}

function createFamilyApi({ store, userId, today = '2026-07-09' }) {
  return {
    async handle(event = {}) {
      try {
        if (event.action === 'getMyFamily') {
          const { family, membership } = await ensureDefaultFamily(store, userId, today, event)
          const members = await listItems(store, 'family_members', (item) => item.familyId === family.familyId && item.status === 'active')
          return { ok: true, data: { family, members, membership } }
        }

        if (event.action === 'createInvite') {
          const membership = await requirePermission(store, userId, 'invite_members')
          const inviteId = makeId('invite')
          const invite = await addItem(store, 'family_invites', {
            id: inviteId,
            inviteId,
            familyId: membership.familyId,
            createdBy: userId,
            role: 'member',
            expiresAt: addDays(today, 7),
            status: 'active',
            createdAt: today
          })
          return { ok: true, data: invite }
        }

        if (event.action === 'joinFamilyByInvite') {
          const invite = await getItem(store, 'family_invites', (item) => item.inviteId === event.inviteId && item.status === 'active')
          if (!invite || invite.expiresAt < today) {
            return { ok: false, error: '邀请已过期，请让家人重新发送邀请' }
          }
          const existing = await getActiveMembership(store, userId)
          if (existing && existing.familyId === invite.familyId) return { ok: true, data: existing }
          if (existing) {
            const existingMembers = await listItems(store, 'family_members', (item) => item.familyId === existing.familyId && item.status === 'active')
            if (existing.role !== 'owner' || existingMembers.length > 1) {
              return { ok: false, error: '请先退出当前家庭' }
            }
            await moveUserFamilyData(store, userId, existing.familyId, invite.familyId)
            await updateItem(store, 'family_members', (item) => item._id === existing._id || item.id === existing.id, {
              status: 'left',
              updatedAt: today
            })
            await updateItem(store, 'families', (item) => item.familyId === existing.familyId, {
              status: 'archived',
              updatedAt: today
            })
          }
          const member = await addItem(store, 'family_members', {
            id: makeId('member'),
            familyId: invite.familyId,
            openId: userId,
            nickname: event.nickname || '',
            avatarUrl: event.avatarUrl || '',
            role: invite.role || 'member',
            status: 'active',
            joinedAt: today,
            updatedAt: today
          })
          await updateItem(store, 'family_invites', (item) => item.inviteId === invite.inviteId, {
            status: 'used',
            usedBy: userId,
            usedAt: today
          })
          return { ok: true, data: member }
        }

        if (event.action === 'updateMemberRole') {
          const actor = await requirePermission(store, userId, 'manage_members')
          const target = await getItem(store, 'family_members', (item) => item.familyId === actor.familyId && item.openId === event.openId && item.status === 'active')
          if (!target) return { ok: false, error: '成员不存在' }
          if (target.role === 'owner') return { ok: false, error: '当前身份没有权限修改创建者' }
          if (actor.role === 'admin' && target.role === 'admin') return { ok: false, error: '当前身份没有权限修改管理员' }
          const role = ['admin', 'member'].includes(event.role) ? event.role : 'member'
          const updated = await updateItem(store, 'family_members', (item) => item._id === target._id || item.id === target.id, {
            role,
            updatedAt: today
          })
          return { ok: true, data: updated }
        }

        return { ok: false, error: `Unknown action: ${event.action || 'empty'}` }
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : String(error) }
      }
    }
  }
}

module.exports = {
  createFamilyApi,
  ensureDefaultFamily,
  getActiveMembership,
  moveUserFamilyData,
  requireMembership,
  requirePermission,
  roleCan
}
