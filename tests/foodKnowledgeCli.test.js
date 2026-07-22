const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { checksum } = require('../scripts/lib/foodKnowledgeCompiler')
const { createFoodKnowledgeFixture } = require('./fixtures/foodKnowledgeFixture')

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
