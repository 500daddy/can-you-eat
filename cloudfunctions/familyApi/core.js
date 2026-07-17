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

async function moveUserFamilyData(store, userId, fromFamilyId, toFamilyId, today) {
  const collections = ['user_food_records', 'purchase_plans', 'recognition_logs']
  for (const collection of collections) {
    if (typeof store.updateManyByFields === 'function') {
      await store.updateManyByFields(collection, { familyId: fromFamilyId, userId }, { familyId: toFamilyId })
      continue
    }
    const records = await listItems(store, collection, (item) => item.familyId === fromFamilyId && item.userId === userId)
    for (const record of records) {
      await updateItem(store, collection, (item) => item._id === record._id || item.id === record.id, {
        familyId: toFamilyId,
        updatedAt: today
      })
    }
  }

  const sourceSettings = await getItem(store, 'family_settings', (item) => item.familyId === fromFamilyId)
  const targetSettings = await getItem(store, 'family_settings', (item) => item.familyId === toFamilyId)
  if (sourceSettings && !targetSettings) {
    await updateItem(
      store,
      'family_settings',
      (item) => item._id === sourceSettings._id || item.id === sourceSettings.id,
      { familyId: toFamilyId, updatedAt: today }
    )
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
    kind: 'personal',
    formalizedAt: null,
    formalizedReason: null,
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

async function normalizeFamilyKind(store, family, membership, today) {
  if (!family || family.kind) return family
  const members = await listItems(store, 'family_members', (item) => item.familyId === family.familyId && item.status === 'active')
  const invites = await listItems(store, 'family_invites', (item) => item.familyId === family.familyId && ['active', 'used'].includes(item.status))
  const kind = members.length > 1 || invites.length > 0 || membership.role !== 'owner'
    ? 'formal'
    : 'personal'
  return updateItem(store, 'families', (item) => item.familyId === family.familyId, {
    kind,
    formalizedAt: kind === 'formal' ? today : null,
    formalizedReason: kind === 'formal' ? 'legacy_activity' : null,
    updatedAt: today
  })
}

async function formalizeFamily(store, familyId, today, reason) {
  const family = await getItem(store, 'families', (item) => item.familyId === familyId && item.status === 'active')
  if (!family || family.kind === 'formal') return family
  return updateItem(store, 'families', (item) => item.familyId === familyId, {
    kind: 'formal',
    formalizedAt: today,
    formalizedReason: reason,
    updatedAt: today
  })
}

async function writeMemberAudit(store, actor, target, updated, action, summary, today) {
  return addItem(store, 'family_audit_logs', {
    id: makeId('audit'),
    familyId: actor.familyId,
    actorOpenId: actor.openId,
    actorName: actor.nickname || '家庭成员',
    actorAvatar: actor.avatarUrl || '',
    action,
    targetType: 'family_member',
    targetId: target.openId,
    before: { role: target.role, status: target.status },
    after: { role: updated.role, status: updated.status },
    summary,
    createdAt: today
  })
}

async function deactivateMember(store, member, actor, audit, today) {
  const matchesMember = (item) => (
    (item._id === member._id || item.id === member.id) && item.status === 'active'
  )
  const updated = await updateItem(store, 'family_members', matchesMember, {
    status: 'inactive',
    leftAt: today,
    updatedAt: today
  })
  if (!updated) return null

  try {
    await writeMemberAudit(
      store,
      actor,
      member,
      updated,
      audit.action,
      audit.summary,
      today
    )
  } catch (error) {
    await updateItem(store, 'family_members', (item) => (
      (item._id === member._id || item.id === member.id) && item.status === 'inactive'
    ), {
      status: member.status,
      leftAt: member.leftAt,
      updatedAt: member.updatedAt
    })
    throw error
  }

  return updated
}

function createFamilyApi({ store, userId, today = '2026-07-09' }) {
  return {
    async handle(event = {}) {
      try {
        if (event.action === 'getMyFamily') {
          const context = await ensureDefaultFamily(store, userId, today, event)
          const family = await normalizeFamilyKind(store, context.family, context.membership, today)
          const members = await listItems(store, 'family_members', (item) => item.familyId === family.familyId && item.status === 'active')
          return { ok: true, data: { family, members, membership: context.membership } }
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
          try {
            await formalizeFamily(store, membership.familyId, today, 'invite_created')
          } catch (error) {
            await updateItem(store, 'family_invites', (item) => item.inviteId === inviteId, {
              status: 'revoked',
              updatedAt: today
            })
            throw error
          }
          return { ok: true, data: invite }
        }

        if (event.action === 'getInvitePreview') {
          const invite = await getItem(store, 'family_invites', (item) => item.inviteId === event.inviteId)
          if (!invite || invite.status !== 'active' || invite.expiresAt < today) {
            return { ok: false, code: 'INVITE_EXPIRED', error: '邀请已失效，请联系邀请人重新发送' }
          }
          const family = await getItem(store, 'families', (item) => item.familyId === invite.familyId && item.status === 'active')
          const inviter = await getItem(store, 'family_members', (item) => item.familyId === invite.familyId && item.openId === invite.createdBy)
          const members = await listItems(store, 'family_members', (item) => item.familyId === invite.familyId && item.status === 'active')
          return {
            ok: true,
            data: {
              familyName: (family && family.name) || '家庭食材库',
              inviterName: (inviter && inviter.nickname) || '家人',
              memberCount: members.length,
              expiresAt: invite.expiresAt,
              status: invite.status
            }
          }
        }

        if (event.action === 'joinFamilyByInvite') {
          const invite = await getItem(store, 'family_invites', (item) => item.inviteId === event.inviteId)
          if (!invite || invite.expiresAt < today || ['expired', 'revoked'].includes(invite.status)) {
            return { ok: false, code: 'INVITE_EXPIRED', error: '邀请已过期，请让家人重新发送邀请' }
          }
          if (invite.status === 'used') {
            const current = await getActiveMembership(store, userId)
            if (invite.usedBy === userId && current && current.familyId === invite.familyId) {
              return { ok: true, data: current }
            }
            return { ok: false, code: 'INVITE_USED', error: '这条邀请已经被使用，请联系邀请人重新发送' }
          }
          const existing = await getActiveMembership(store, userId)
          if (existing && existing.familyId === invite.familyId) return { ok: true, data: existing }
          if (existing) {
            const currentFamily = await getItem(store, 'families', (item) => item.familyId === existing.familyId && item.status === 'active')
            const normalizedFamily = await normalizeFamilyKind(store, currentFamily, existing, today)
            if (!normalizedFamily || normalizedFamily.kind !== 'personal') {
              return {
                ok: false,
                code: 'ALREADY_IN_FORMAL_FAMILY',
                error: '你已经加入一个家庭，暂时无法加入其他家庭'
              }
            }
            await moveUserFamilyData(store, userId, existing.familyId, invite.familyId, today)
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
          await formalizeFamily(store, invite.familyId, today, 'member_joined')
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

        if (event.action === 'removeMember') {
          const actor = await requirePermission(store, userId, 'manage_members')
          if (event.openId === actor.openId) return { ok: false, error: '创建者不能移出自己' }
          const target = await getItem(store, 'family_members', (item) => (
            item.familyId === actor.familyId && item.openId === event.openId && item.status === 'active'
          ))
          if (!target) {
            const previous = await getItem(store, 'family_members', (item) => (
              item.familyId === actor.familyId && item.openId === event.openId
            ))
            return { ok: false, error: previous ? '成员已退出' : '成员不存在' }
          }
          if (target.role === 'owner') return { ok: false, error: '不能移出创建者' }
          const updated = await deactivateMember(
            store,
            target,
            actor,
            {
              action: 'member_removed',
              summary: `移出家庭成员：${target.nickname || target.openId}`
            },
            today
          )
          if (!updated) return { ok: false, error: '成员已退出或不存在' }
          return { ok: true, data: updated }
        }

        if (event.action === 'leaveFamily') {
          const membership = await requireMembership(store, userId)
          if (membership.role === 'owner') return { ok: false, error: '创建者不能退出家庭' }
          const updated = await deactivateMember(
            store,
            membership,
            membership,
            {
              action: 'member_left',
              summary: `${membership.nickname || membership.openId}退出家庭`
            },
            today
          )
          if (!updated) return { ok: false, error: '成员已退出或不存在' }
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
