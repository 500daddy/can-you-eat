function compactObject(value) {
  return Object.keys(value).reduce((result, key) => {
    if (value[key] !== undefined) {
      result[key] = value[key]
    }
    return result
  }, {})
}

function buildCloudUpdateData(_found, patch, removeValue) {
  const next = {}
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) {
      if (removeValue === undefined) {
        throw new Error(`Cloud database remove command is unavailable for undefined field: ${key}`)
      }
      next[key] = removeValue
    } else {
      next[key] = patch[key]
    }
  }

  return next
}

function getRemoveValue(db, patch) {
  const undefinedFields = Object.keys(patch).filter((key) => patch[key] === undefined)
  if (!undefinedFields.length) return undefined
  if (!db.command || typeof db.command.remove !== 'function') {
    throw new Error(`Cloud database remove command is unavailable for undefined fields: ${undefinedFields.join(', ')}`)
  }
  return db.command.remove()
}

function isAlreadyExistsError(error) {
  const message = String((error && (error.errMsg || error.message)) || error || '')
  return /already exists|collection.*exists|ResourceExist|Table exist|DATABASE_COLLECTION_ALREADY_EXIST|集合.*存在/i.test(message)
}

async function ensureCollections(db, collections) {
  if (!db || typeof db.createCollection !== 'function') {
    return {
      supported: false,
      created: [],
      existing: [],
      skipped: collections.slice()
    }
  }

  const result = {
    supported: true,
    created: [],
    existing: [],
    skipped: []
  }

  for (const collection of collections) {
    try {
      await db.createCollection(collection)
      result.created.push(collection)
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        result.existing.push(collection)
        continue
      }
      throw error
    }
  }

  return result
}

function createCloudStore(db) {
  const store = {
    async list(collection, predicate) {
      if (predicate) {
        const all = []
        let skip = 0
        const limit = 100
        while (true) {
          const res = await db.collection(collection).skip(skip).limit(limit).get()
          all.push(...res.data)
          if (res.data.length < limit) break
          skip += limit
        }
        return all.filter(predicate)
      }
      const res = await db.collection(collection).limit(100).get()
      return res.data
    },

    async get(collection, predicate) {
      const list = await this.list(collection, predicate)
      return list[0] || null
    },

    async listByFields(collection, fields) {
      const all = []
      let skip = 0
      const limit = 100
      const query = db.collection(collection).where(fields)
      while (true) {
        const res = await query.skip(skip).limit(limit).get()
        all.push(...res.data)
        if (res.data.length < limit) break
        skip += limit
      }
      return all
    },

    async getByFields(collection, fields) {
      const res = await db.collection(collection).where(fields).limit(1).get()
      return res.data[0] || null
    },

    async add(collection, doc) {
      await db.collection(collection).add({ data: doc })
      return doc
    },

    async setByDocumentId(collection, documentId, doc) {
      const data = compactObject(doc)
      await db.collection(collection).doc(documentId).set({ data })
      return data
    },

    async updateByDocumentId(collection, documentId, patch) {
      const removeValue = getRemoveValue(db, patch)
      const data = buildCloudUpdateData(null, patch, removeValue)
      await db.collection(collection).doc(documentId).update({ data })
      return { _id: documentId, ...compactObject(patch) }
    },

    async update(collection, predicate, patch) {
      const found = await this.get(collection, predicate)
      if (!found) return null
      const id = found._id
      const removeValue = getRemoveValue(db, patch)
      const next = buildCloudUpdateData(found, patch, removeValue)
      await db.collection(collection).doc(id).update({ data: next })
      return { ...compactObject({ ...found, ...patch }), _id: id }
    },

    async updateManyByFields(collection, fields, patch) {
      const removeValue = getRemoveValue(db, patch)
      const data = buildCloudUpdateData(null, patch, removeValue)
      return db.collection(collection).where(fields).update({ data })
    }
  }

  return store
}

module.exports = {
  buildCloudUpdateData,
  createCloudStore,
  ensureCollections,
  isAlreadyExistsError
}
