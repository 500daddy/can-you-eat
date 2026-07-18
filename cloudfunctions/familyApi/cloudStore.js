function compactObject(value) {
  return Object.keys(value).reduce((result, key) => {
    if (value[key] !== undefined) {
      result[key] = value[key]
    }
    return result
  }, {})
}

function buildCloudUpdateData(found, patch, removeValue) {
  const next = compactObject({ ...found, ...patch })
  delete next._id

  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) {
      next[key] = removeValue
    }
  }

  return next
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

function createStore(client, rootDb, includeTransaction) {
  const store = {
    async list(collection, predicate) {
      if (predicate) {
        const all = []
        let skip = 0
        const limit = 100
        while (true) {
          const res = await client.collection(collection).skip(skip).limit(limit).get()
          all.push(...res.data)
          if (res.data.length < limit) break
          skip += limit
        }
        return all.filter(predicate)
      }
      const res = await client.collection(collection).limit(100).get()
      return res.data
    },

    async get(collection, predicate) {
      const list = await this.list(collection, predicate)
      return list[0] || null
    },

    async add(collection, doc) {
      await client.collection(collection).add({ data: doc })
      return doc
    },

    async update(collection, predicate, patch) {
      const found = await this.get(collection, predicate)
      if (!found) return null
      const id = found._id
      const removeValue = rootDb.command && rootDb.command.remove ? rootDb.command.remove() : undefined
      const next = buildCloudUpdateData(found, patch, removeValue)
      await client.collection(collection).doc(id).update({ data: next })
      return { ...compactObject({ ...found, ...patch }), _id: id }
    },

    async updateManyByFields(collection, fields, patch) {
      const removeValue = rootDb.command && rootDb.command.remove ? rootDb.command.remove() : undefined
      const data = buildCloudUpdateData({}, patch, removeValue)
      return client.collection(collection).where(fields).update({ data })
    }
  }

  if (includeTransaction) {
    store.runTransaction = (callback) => rootDb.runTransaction((transaction) => (
      callback(createStore(transaction, rootDb, false))
    ))
  }

  return store
}

function createCloudStore(db) {
  return createStore(db, db, true)
}

module.exports = {
  buildCloudUpdateData,
  createCloudStore,
  ensureCollections,
  isAlreadyExistsError
}
