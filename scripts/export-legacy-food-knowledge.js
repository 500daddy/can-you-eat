const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const { exportLegacyFoodKnowledge } = require('./lib/legacyFoodKnowledgeExport')
const { foodBase } = require('../utils/foodBase')

function parseOptions(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === '--output' && args[index + 1] !== undefined && !args[index + 1].startsWith('--')) {
      options[name] = args[index + 1]
      index += 1
    }
  }

  return options
}

function main() {
  const options = parseOptions(process.argv.slice(2))
  if (!options['--output']) {
    throw new Error('required options: --output')
  }

  const outputDirectory = path.resolve(options['--output'])
  const result = exportLegacyFoodKnowledge(foodBase)
  const files = {
    'foods.json': result.foods,
    'search-terms.json': result.searchTerms,
    'storage-candidates.json': result.storageCandidates,
    'report.json': result.report
  }

  mkdirSync(outputDirectory, { recursive: true })
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`)
  }
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
