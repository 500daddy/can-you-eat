const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const { buildFoodKnowledgeRelease } = require('./lib/foodKnowledgeCompiler')

function parseOptions(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (!name.startsWith('--')) {
      continue
    }

    const value = args[index + 1]
    if (value !== undefined && !value.startsWith('--')) {
      options[name] = value
      index += 1
    }
  }

  return options
}

function requireOptions(options, names) {
  const missing = names.filter((name) => !options[name])
  if (missing.length > 0) {
    throw new Error(`required options: ${missing.join(', ')}`)
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function main() {
  const options = parseOptions(process.argv.slice(2))
  requireOptions(options, ['--input', '--output', '--release', '--generated-at'])

  const inputDirectory = path.resolve(options['--input'])
  const outputDirectory = path.resolve(options['--output'])
  const input = {
    foods: readJson(path.join(inputDirectory, 'foods.json')),
    searchTerms: readJson(path.join(inputDirectory, 'search-terms.json')),
    storageRules: readJson(path.join(inputDirectory, 'storage-rules.json')),
    evidenceSources: readJson(path.join(inputDirectory, 'evidence-sources.json'))
  }
  const release = buildFoodKnowledgeRelease(input, {
    releaseId: options['--release'],
    generatedAt: options['--generated-at'],
    previousReleaseId: options['--previous-release'] || null
  })

  mkdirSync(outputDirectory, { recursive: true })
  writeJson(path.join(outputDirectory, 'manifest.json'), release.manifest)
  writeJson(path.join(outputDirectory, 'snapshot.json'), release.snapshot)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
