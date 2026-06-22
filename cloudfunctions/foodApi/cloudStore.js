const { compactObject } = require('./core')

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

function createCloudStore(db) {
  return {
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

    async add(collection, doc) {
      await db.collection(collection).add({ data: doc })
      return doc
    },

    async update(collection, predicate, patch) {
      const found = await this.get(collection, predicate)
      if (!found) return null
      const id = found._id
      const removeValue = db.command && db.command.remove ? db.command.remove() : undefined
      const next = buildCloudUpdateData(found, patch, removeValue)
      await db.collection(collection).doc(id).update({ data: next })
      return { ...compactObject({ ...found, ...patch }), _id: id }
    }
  }
}

module.exports = {
  buildCloudUpdateData,
  createCloudStore
}
