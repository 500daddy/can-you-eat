const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')

const { buildFoodKnowledgeRelease } = require('./lib/foodKnowledgeCompiler')

const BUILD_OPTIONS = ['--input', '--output', '--release', '--generated-at', '--previous-release']

function parseOptions(args, allowedNames = BUILD_OPTIONS) {
  const options = {}
  const allowed = new Set(allowedNames)

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (!name.startsWith('--')) {
      throw new Error(`unexpected argument: ${name}`)
    }
    if (!allowed.has(name)) {
      throw new Error(`unknown option: ${name}`)
    }
    if (Object.hasOwn(options, name)) {
      throw new Error(`duplicate option: ${name}`)
    }

    const value = args[index + 1]
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new Error(`option requires a value: ${name}`)
    }
    options[name] = value
    index += 1
  }

  return options
}

function requireOptions(options, names) {
  const missing = names.filter((name) => !options[name])
  if (missing.length > 0) {
    throw new Error(`required options: ${missing.join(', ')}`)
  }
}

function readJson(filePath, fsAdapter = fs) {
  let source
  try {
    source = fsAdapter.readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    return JSON.parse(source)
  } catch (error) {
    throw new Error(`failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function removeGeneratedDirectory(directory, fsAdapter) {
  if (fsAdapter.existsSync(directory)) {
    fsAdapter.rmSync(directory, { recursive: true, force: true })
  }
}

function assertExpectedDirectory(directory, expectedNames, fsAdapter, label) {
  const actualNames = fsAdapter.readdirSync(directory).sort()
  const expected = [...expectedNames].sort()
  if (actualNames.length !== expected.length || actualNames.some((name, index) => name !== expected[index])) {
    throw new Error(`${label} file set is incomplete`)
  }

  for (const name of actualNames) {
    if (!fsAdapter.lstatSync(path.join(directory, name)).isFile()) {
      throw new Error(`${label} entry is not a regular file: ${name}`)
    }
  }
}

function writeJsonDirectoryTransaction(outputDirectory, files, dependencies = {}) {
  const fsAdapter = dependencies.fs || fs
  const expectedNames = Object.keys(files).sort()
  const root = path.parse(outputDirectory).root
  if (outputDirectory === root || path.basename(outputDirectory) === '') {
    throw new Error('output directory must not be a filesystem root')
  }

  const targetExists = fsAdapter.existsSync(outputDirectory)
  if (targetExists) {
    if (!fsAdapter.lstatSync(outputDirectory).isDirectory()) {
      throw new Error(`output path is not a directory: ${outputDirectory}`)
    }

    const existingNames = fsAdapter.readdirSync(outputDirectory).sort()
    const unexpectedNames = existingNames.filter((name) => !expectedNames.includes(name))
    if (unexpectedNames.length > 0) {
      throw new Error(`unexpected output entries: ${unexpectedNames.join(', ')}`)
    }
    for (const name of existingNames) {
      if (!fsAdapter.lstatSync(path.join(outputDirectory, name)).isFile()) {
        throw new Error(`output entry is not a regular file: ${name}`)
      }
    }
  }

  const parentDirectory = path.dirname(outputDirectory)
  const baseName = path.basename(outputDirectory)
  const token = dependencies.token || randomUUID()
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('transaction token contains unsupported characters')
  }
  const stagingDirectory = path.join(parentDirectory, `.${baseName}.stage-${token}`)
  const backupDirectory = path.join(parentDirectory, `.${baseName}.backup-${token}`)

  fsAdapter.mkdirSync(parentDirectory, { recursive: true })
  if (fsAdapter.existsSync(stagingDirectory) || fsAdapter.existsSync(backupDirectory)) {
    throw new Error('transaction staging path already exists')
  }

  fsAdapter.mkdirSync(stagingDirectory)
  try {
    for (const name of expectedNames) {
      fsAdapter.writeFileSync(
        path.join(stagingDirectory, name),
        `${JSON.stringify(files[name], null, 2)}\n`
      )
    }
    assertExpectedDirectory(stagingDirectory, expectedNames, fsAdapter, 'staging output')
  } catch (error) {
    removeGeneratedDirectory(stagingDirectory, fsAdapter)
    throw error
  }

  if (!targetExists) {
    try {
      fsAdapter.renameSync(stagingDirectory, outputDirectory)
      return
    } catch (error) {
      removeGeneratedDirectory(stagingDirectory, fsAdapter)
      throw new Error(`failed to commit output ${outputDirectory}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    fsAdapter.renameSync(outputDirectory, backupDirectory)
  } catch (error) {
    removeGeneratedDirectory(stagingDirectory, fsAdapter)
    throw new Error(`failed to back up output ${outputDirectory}: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    fsAdapter.renameSync(stagingDirectory, outputDirectory)
  } catch (error) {
    let rollbackError = null
    try {
      fsAdapter.renameSync(backupDirectory, outputDirectory)
    } catch (caught) {
      rollbackError = caught
    }
    removeGeneratedDirectory(stagingDirectory, fsAdapter)
    const detail = rollbackError
      ? `; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      : ''
    throw new Error(`failed to commit output ${outputDirectory}: ${error instanceof Error ? error.message : String(error)}${detail}`)
  }

  try {
    removeGeneratedDirectory(backupDirectory, fsAdapter)
  } catch (error) {
    const message = `committed output ${outputDirectory}; failed to remove backup ${backupDirectory}: ${error instanceof Error ? error.message : String(error)}`
    try {
      if (dependencies.onWarning) {
        dependencies.onWarning(message)
      } else {
        process.stderr.write(`warning: ${message}\n`)
      }
    } catch {
      // The output is already committed; warning delivery must not change its result.
    }
  }
}

function main(args = process.argv.slice(2), dependencies = {}) {
  const fsAdapter = dependencies.fs || fs
  const options = parseOptions(args)
  requireOptions(options, ['--input', '--output', '--release', '--generated-at'])

  const inputDirectory = path.resolve(options['--input'])
  const outputDirectory = path.resolve(options['--output'])
  const input = {
    foods: readJson(path.join(inputDirectory, 'foods.json'), fsAdapter),
    searchTerms: readJson(path.join(inputDirectory, 'search-terms.json'), fsAdapter),
    storageRules: readJson(path.join(inputDirectory, 'storage-rules.json'), fsAdapter),
    evidenceSources: readJson(path.join(inputDirectory, 'evidence-sources.json'), fsAdapter)
  }
  const release = buildFoodKnowledgeRelease(input, {
    releaseId: options['--release'],
    generatedAt: options['--generated-at'],
    previousReleaseId: options['--previous-release'] || null
  })

  writeJsonDirectoryTransaction(outputDirectory, {
    'manifest.json': release.manifest,
    'snapshot.json': release.snapshot
  }, dependencies)
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
  main,
  parseOptions,
  readJson,
  requireOptions,
  writeJsonDirectoryTransaction
}
