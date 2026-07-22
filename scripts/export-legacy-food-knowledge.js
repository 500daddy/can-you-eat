const path = require('node:path')

const { exportLegacyFoodKnowledge } = require('./lib/legacyFoodKnowledgeExport')
const {
  parseOptions,
  requireOptions,
  writeJsonDirectoryTransaction
} = require('./build-food-knowledge')
const { foodBase } = require('../utils/foodBase')

function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseOptions(args, ['--output'])
  requireOptions(options, ['--output'])

  const outputDirectory = path.resolve(options['--output'])
  const result = exportLegacyFoodKnowledge(foodBase)
  const files = {
    'foods.json': result.foods,
    'search-terms.json': result.searchTerms,
    'storage-candidates.json': result.storageCandidates,
    'report.json': result.report
  }

  writeJsonDirectoryTransaction(outputDirectory, files, dependencies)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  main
}
