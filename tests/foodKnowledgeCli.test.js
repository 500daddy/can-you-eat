const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} = fs
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { checksum } = require('../scripts/lib/foodKnowledgeCompiler')
const { createFoodKnowledgeFixture } = require('./fixtures/foodKnowledgeFixture')
const { writeJsonDirectoryTransaction } = require('../scripts/build-food-knowledge')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const BUILD_SCRIPT = path.join(PROJECT_ROOT, 'scripts/build-food-knowledge.js')
const EXPORT_SCRIPT = path.join(PROJECT_ROOT, 'scripts/export-legacy-food-knowledge.js')

function createTempDir(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'food-knowledge-cli-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function writeBuildInput(directory, fixture) {
  mkdirSync(directory, { recursive: true })
  const files = {
    'foods.json': fixture.foods,
    'search-terms.json': fixture.searchTerms,
    'storage-rules.json': fixture.storageRules,
    'evidence-sources.json': fixture.evidenceSources
  }

  for (const [name, value] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`)
  }
}

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8'
  })
}

function snapshotDirectory(directory) {
  return Object.fromEntries(
    readdirSync(directory)
      .sort()
      .map((name) => [name, readFileSync(path.join(directory, name)).toString('base64')])
  )
}

function transactionArtifacts(outputDirectory) {
  const parentDirectory = path.dirname(outputDirectory)
  const prefix = `.${path.basename(outputDirectory)}.`
  return readdirSync(parentDirectory).filter((name) => name.startsWith(prefix)).sort()
}

function snapshotJsonValues(files) {
  return Object.fromEntries(
    Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => [
        name,
        Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString('base64')
      ])
  )
}

test('build CLI writes a checksummed release and defaults previousReleaseId to null', (t) => {
  const tempDirectory = createTempDir(t)
  const inputDirectory = path.join(tempDirectory, 'input')
  const outputDirectory = path.join(tempDirectory, 'output')
  writeBuildInput(inputDirectory, createFoodKnowledgeFixture())

  const result = runNode(BUILD_SCRIPT, [
    '--input', inputDirectory,
    '--output', outputDirectory,
    '--release', 'food-kb-cli.1',
    '--generated-at', '2026-07-22T00:00:00.000Z'
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readdirSync(outputDirectory).sort(), ['manifest.json', 'snapshot.json'])

  const manifestText = readFileSync(path.join(outputDirectory, 'manifest.json'), 'utf8')
  const snapshotText = readFileSync(path.join(outputDirectory, 'snapshot.json'), 'utf8')
  const manifest = JSON.parse(manifestText)
  const snapshot = JSON.parse(snapshotText)

  assert.equal(manifest.releaseId, 'food-kb-cli.1')
  assert.equal(snapshot.releaseId, 'food-kb-cli.1')
  assert.equal(manifest.previousReleaseId, null)
  assert.equal(snapshot.previousReleaseId, null)
  assert.match(manifest.snapshotChecksum, /^[0-9a-f]{64}$/)
  assert.equal(manifest.snapshotChecksum, checksum(snapshot))
  assert.equal(manifestText, `${JSON.stringify(manifest, null, 2)}\n`)
  assert.equal(snapshotText, `${JSON.stringify(snapshot, null, 2)}\n`)
})

test('build CLI rejects a baby deadline without direct baby evidence before writing output', (t) => {
  const tempDirectory = createTempDir(t)
  const inputDirectory = path.join(tempDirectory, 'input')
  const outputDirectory = path.join(tempDirectory, 'output')
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules[0].babyDaysMax = 1
  writeBuildInput(inputDirectory, fixture)

  const result = runNode(BUILD_SCRIPT, [
    '--input', inputDirectory,
    '--output', outputDirectory,
    '--release', 'food-kb-cli.invalid',
    '--generated-at', '2026-07-22T00:00:00.000Z'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /baby deadline requires direct baby evidence/)
  assert.equal(result.stdout, '')
  assert.equal(readdirSync(tempDirectory).includes('output'), false)
})

test('legacy export CLI writes exactly four non-publishable migration files', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'legacy-v1')

  const result = runNode(EXPORT_SCRIPT, ['--output', outputDirectory])

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readdirSync(outputDirectory).sort(), [
    'foods.json',
    'report.json',
    'search-terms.json',
    'storage-candidates.json'
  ])

  for (const name of readdirSync(outputDirectory)) {
    const text = readFileSync(path.join(outputDirectory, name), 'utf8')
    assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`, name)
  }

  const foods = JSON.parse(readFileSync(path.join(outputDirectory, 'foods.json'), 'utf8'))
  const report = JSON.parse(readFileSync(path.join(outputDirectory, 'report.json'), 'utf8'))
  assert.ok(foods.every((food) => food.reviewStatus === 'legacy_unverified'))
  assert.equal(report.publishableFoodCount, 0)
  assert.equal(report.publishableRuleCount, 0)
})

test('build CLI lists every required option before resolving paths', () => {
  const result = runNode(BUILD_SCRIPT, [])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /required options: --input, --output, --release, --generated-at/)
  assert.doesNotMatch(result.stderr, /TypeError|node:path|at /)
})

test('legacy export CLI reports its required output option without a stack', () => {
  const result = runNode(EXPORT_SCRIPT, [])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /required options: --output/)
  assert.doesNotMatch(result.stderr, /TypeError|node:path|at /)
})

test('CLI modules can be required without executing either command', () => {
  const source = `
    require(${JSON.stringify(BUILD_SCRIPT)})
    require(${JSON.stringify(EXPORT_SCRIPT)})
  `
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
})

test('transactional writer preserves existing output byte-for-byte when a staging write fails', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'release')
  mkdirSync(outputDirectory)
  writeFileSync(path.join(outputDirectory, 'manifest.json'), '{"old":"manifest"}\n')
  writeFileSync(path.join(outputDirectory, 'snapshot.json'), '{"old":"snapshot"}\n')
  const before = snapshotDirectory(outputDirectory)
  let writeCount = 0
  const failingFs = {
    ...fs,
    writeFileSync(filePath, content) {
      writeCount += 1
      if (writeCount === 2) {
        throw new Error('simulated staging write failure')
      }
      return fs.writeFileSync(filePath, content)
    }
  }

  assert.throws(
    () => writeJsonDirectoryTransaction(outputDirectory, {
      'manifest.json': { releaseId: 'new' },
      'snapshot.json': { releaseId: 'new' }
    }, { fs: failingFs, token: 'write-failure' }),
    /simulated staging write failure/
  )
  assert.deepEqual(snapshotDirectory(outputDirectory), before)
  assert.deepEqual(transactionArtifacts(outputDirectory), [])
})

test('transactional writer restores old output when staging cannot be renamed into place', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'release')
  mkdirSync(outputDirectory)
  writeFileSync(path.join(outputDirectory, 'manifest.json'), '{"old":"manifest"}\n')
  writeFileSync(path.join(outputDirectory, 'snapshot.json'), '{"old":"snapshot"}\n')
  const before = snapshotDirectory(outputDirectory)
  let renameCount = 0
  const failingFs = {
    ...fs,
    renameSync(from, to) {
      renameCount += 1
      if (renameCount === 2) {
        throw new Error('simulated staging commit failure')
      }
      return fs.renameSync(from, to)
    }
  }

  assert.throws(
    () => writeJsonDirectoryTransaction(outputDirectory, {
      'manifest.json': { releaseId: 'new' },
      'snapshot.json': { releaseId: 'new' }
    }, { fs: failingFs, token: 'rename-failure' }),
    /simulated staging commit failure/
  )
  assert.deepEqual(snapshotDirectory(outputDirectory), before)
  assert.deepEqual(transactionArtifacts(outputDirectory), [])
})

test('transactional writer keeps committed output when backup cleanup partially fails', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'release')
  const token = 'backup-cleanup-failure'
  const backupDirectory = path.join(tempDirectory, `.release.backup-${token}`)
  mkdirSync(outputDirectory)
  writeFileSync(path.join(outputDirectory, 'manifest.json'), '{"old":"manifest"}\n')
  writeFileSync(path.join(outputDirectory, 'snapshot.json'), '{"old":"snapshot"}\n')
  const newFiles = {
    'manifest.json': { releaseId: 'new', counts: { foods: 1 } },
    'snapshot.json': { releaseId: 'new', foods: [] }
  }
  const warnings = []
  const partiallyFailingFs = {
    ...fs,
    rmSync(directory, options) {
      if (directory === backupDirectory) {
        fs.unlinkSync(path.join(directory, 'manifest.json'))
        throw new Error('simulated partial backup cleanup failure')
      }
      return fs.rmSync(directory, options)
    }
  }

  assert.doesNotThrow(() => writeJsonDirectoryTransaction(outputDirectory, newFiles, {
    fs: partiallyFailingFs,
    token,
    onWarning(message) {
      warnings.push(message)
    }
  }))
  assert.deepEqual(snapshotDirectory(outputDirectory), snapshotJsonValues(newFiles))
  assert.deepEqual(transactionArtifacts(outputDirectory), [`.release.backup-${token}`])
  assert.deepEqual(readdirSync(backupDirectory), ['snapshot.json'])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /committed output .* failed to remove backup/)
  assert.match(warnings[0], new RegExp(backupDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(warnings[0], /simulated partial backup cleanup failure/)
})

test('legacy export refuses an unexpected existing file without modifying the directory', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'legacy-v1')
  mkdirSync(outputDirectory)
  writeFileSync(path.join(outputDirectory, 'foods.json'), 'existing foods\n')
  writeFileSync(path.join(outputDirectory, 'stale.json'), 'keep me\n')
  const before = snapshotDirectory(outputDirectory)

  const result = runNode(EXPORT_SCRIPT, ['--output', outputDirectory])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unexpected output entries: stale\.json/)
  assert.deepEqual(snapshotDirectory(outputDirectory), before)
  assert.deepEqual(transactionArtifacts(outputDirectory), [])
})

test('build CLI rejects duplicate options before reading or writing files', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'output')

  const result = runNode(BUILD_SCRIPT, [
    '--input', path.join(tempDirectory, 'first'),
    '--input', path.join(tempDirectory, 'second'),
    '--output', outputDirectory,
    '--release', 'duplicate',
    '--generated-at', '2026-07-22T00:00:00.000Z'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /duplicate option: --input/)
  assert.equal(existsSync(outputDirectory), false)
})

test('build CLI rejects an option whose next token is another flag', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'output')

  const result = runNode(BUILD_SCRIPT, [
    '--input',
    '--output', outputDirectory,
    '--release', 'missing-value',
    '--generated-at', '2026-07-22T00:00:00.000Z'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /option requires a value: --input/)
  assert.equal(existsSync(outputDirectory), false)
})

test('build CLI rejects unknown options without creating output', (t) => {
  const tempDirectory = createTempDir(t)
  const inputDirectory = path.join(tempDirectory, 'input')
  const outputDirectory = path.join(tempDirectory, 'output')
  writeBuildInput(inputDirectory, createFoodKnowledgeFixture())

  const result = runNode(BUILD_SCRIPT, [
    '--input', inputDirectory,
    '--output', outputDirectory,
    '--release', 'unknown-option',
    '--generated-at', '2026-07-22T00:00:00.000Z',
    '--mystery', 'value'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unknown option: --mystery/)
  assert.equal(existsSync(outputDirectory), false)
})

test('build CLI rejects extra positional arguments without creating output', (t) => {
  const tempDirectory = createTempDir(t)
  const inputDirectory = path.join(tempDirectory, 'input')
  const outputDirectory = path.join(tempDirectory, 'output')
  writeBuildInput(inputDirectory, createFoodKnowledgeFixture())

  const result = runNode(BUILD_SCRIPT, [
    '--input', inputDirectory,
    '--output', outputDirectory,
    '--release', 'extra-argument',
    '--generated-at', '2026-07-22T00:00:00.000Z',
    'unexpected'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unexpected argument: unexpected/)
  assert.equal(existsSync(outputDirectory), false)
})

test('build CLI identifies malformed JSON and leaves no output directory', (t) => {
  const tempDirectory = createTempDir(t)
  const inputDirectory = path.join(tempDirectory, 'input')
  const outputDirectory = path.join(tempDirectory, 'output')
  writeBuildInput(inputDirectory, createFoodKnowledgeFixture())
  const malformedFile = path.join(inputDirectory, 'storage-rules.json')
  writeFileSync(malformedFile, '{\n')

  const result = runNode(BUILD_SCRIPT, [
    '--input', inputDirectory,
    '--output', outputDirectory,
    '--release', 'malformed-json',
    '--generated-at', '2026-07-22T00:00:00.000Z'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /failed to parse .*storage-rules\.json/)
  assert.equal(existsSync(outputDirectory), false)
  assert.deepEqual(transactionArtifacts(outputDirectory), [])
})

test('legacy export can replace its own complete output without changing any byte', (t) => {
  const tempDirectory = createTempDir(t)
  const outputDirectory = path.join(tempDirectory, 'legacy-v1')

  const first = runNode(EXPORT_SCRIPT, ['--output', outputDirectory])
  assert.equal(first.status, 0, first.stderr)
  const before = snapshotDirectory(outputDirectory)

  const second = runNode(EXPORT_SCRIPT, ['--output', outputDirectory])

  assert.equal(second.status, 0, second.stderr)
  assert.deepEqual(snapshotDirectory(outputDirectory), before)
  assert.deepEqual(transactionArtifacts(outputDirectory), [])
})
