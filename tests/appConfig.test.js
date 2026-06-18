const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const appConfig = require('../app.json')

function exists(projectPath) {
  return fs.existsSync(path.join(root, projectPath.replace(/^\//, '')))
}

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function walkFiles(target) {
  const absolute = path.join(root, target)
  if (!fs.existsSync(absolute)) return []
  const stat = fs.statSync(absolute)
  if (stat.isFile()) return [absolute]

  return fs.readdirSync(absolute).flatMap((entry) => {
    const next = path.join(target, entry)
    const nextAbsolute = path.join(root, next)
    if (fs.statSync(nextAbsolute).isDirectory()) return walkFiles(next)
    return [nextAbsolute]
  })
}

function collectPageUrls() {
  const pattern = /\/pages\/[A-Za-z0-9_/-]+/g
  return ['pages', 'components', 'custom-tab-bar']
    .flatMap(walkFiles)
    .filter((file) => /\.(js|wxml|json)$/.test(file))
    .flatMap((file) => fs.readFileSync(file, 'utf8').match(pattern) || [])
    .map((url) => url.replace(/^\//, ''))
}

function collectComponentRefs() {
  return walkFiles('pages')
    .concat(walkFiles('components'))
    .concat(walkFiles('custom-tab-bar'))
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Object.values(json.usingComponents || {})
    })
}

test('app.json declares pages with required mini program files', () => {
  assert.ok(Array.isArray(appConfig.pages))
  assert.ok(appConfig.pages.length > 0)

  for (const page of appConfig.pages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(exists(`${page}.${ext}`), `${page}.${ext} should exist`)
    }
  }
})

test('tabBar pages and icons exist', () => {
  const pages = new Set(appConfig.pages)
  const items = appConfig.tabBar && appConfig.tabBar.list

  assert.ok(Array.isArray(items))
  for (const item of items) {
    assert.ok(pages.has(item.pagePath), `${item.pagePath} should be declared in app.json pages`)
    assert.ok(exists(item.iconPath), `${item.iconPath} should exist`)
    assert.ok(exists(item.selectedIconPath), `${item.selectedIconPath} should exist`)
  }
})

test('usingComponents references point to component definitions', () => {
  for (const componentPath of collectComponentRefs()) {
    assert.ok(exists(`${componentPath}.json`), `${componentPath}.json should exist`)
    const componentJson = JSON.parse(readText(`${componentPath}.json`))
    assert.equal(componentJson.component, true, `${componentPath} should be a component`)
  }
})

test('literal page navigation targets are declared in app.json', () => {
  const pages = new Set(appConfig.pages)
  const urls = [...new Set(collectPageUrls())]

  assert.ok(urls.length > 0)
  for (const url of urls) {
    assert.ok(pages.has(url), `${url} should be declared in app.json pages`)
  }
})
