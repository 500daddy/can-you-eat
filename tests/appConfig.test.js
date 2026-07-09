const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const appConfig = require('../app.json')
const projectConfig = require('../project.config.json')

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

function isUploadIgnored(projectPath) {
  return (projectConfig.packOptions.ignore || []).some((item) => {
    const value = item.value.replace(/^\.\//, '')
    if (item.type === 'folder') return projectPath === value || projectPath.startsWith(`${value}/`)
    return projectPath === value
  })
}

function collectUploadFiles(target = '.') {
  const absolute = path.join(root, target)
  const projectPath = path.relative(root, absolute)
  if (projectPath && isUploadIgnored(projectPath)) return []
  if (projectPath === '.git' || projectPath.startsWith('.git/')) return []
  const stat = fs.statSync(absolute)
  if (stat.isFile()) return [absolute]

  return fs.readdirSync(absolute).flatMap((entry) => collectUploadFiles(path.join(target, entry)))
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

test('app uses local cloud config for private deployments', () => {
  const appJs = readText('app.js')
  const cloudConfigExample = readText('utils/cloudConfig.example.js')

  assert.equal(projectConfig.appid, 'touristappid')
  assert.match(appJs, /require\('\.\/utils\/cloudConfig\.local'\)/)
  assert.match(appJs, /require\('\.\/utils\/cloudConfig\.example'\)/)
  assert.match(appJs, /cloudEnvId:\s*cloudConfig\.cloudEnvId/)
  assert.match(appJs, /useCloudFoodApi:\s*cloudConfig\.useCloudFoodApi === true/)
  assert.match(cloudConfigExample, /cloud1-please-replace/)
  assert.doesNotMatch(appJs, /cloud1-[a-z0-9]{16,}/)
  assert.doesNotMatch(JSON.stringify(projectConfig), /wx[0-9a-f]{16}/)
})

test('user-facing pages avoid development and configuration copy', () => {
  const blockedPatterns = [
    /subscribeConfig/,
    /模板\s*ID/i,
    /云函数预留/,
    /微信提醒预留/,
    /开发联调/,
    /联调状态/,
    /初始化食材库/,
    /本地食材库/,
    /本地模拟/,
    /云数据模式/,
    /订阅模板/,
    /MVP/,
    /后续配置/,
    /测试提醒/,
    /置信度/,
    /免责声明/,
    /模拟识别/,
    /模拟结果/,
    /Beta/,
    /实验功能/,
    /暂未开放/,
    /上线后/,
    /体验中/,
    /即将上线/,
    /敬请期待/,
    /AI功能实验室/,
    /辅食安全问答/
  ]
  const files = walkFiles('pages')
    .filter((file) => /\.(wxml|js)$/.test(file))
    .filter((file) => !file.endsWith('pages/recognize/index.js'))

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of blockedPatterns) {
      assert.doesNotMatch(source, pattern, `${path.relative(root, file)} should not expose ${pattern}`)
    }
  }
})

test('project upload ignores local icon generation packs', () => {
  const ignoredFolders = new Set(
    (projectConfig.packOptions.ignore || [])
      .filter((item) => item.type === 'folder')
      .map((item) => item.value)
  )
  const ignoredFiles = new Set(
    (projectConfig.packOptions.ignore || [])
      .filter((item) => item.type === 'file')
      .map((item) => item.value)
  )

  assert.ok(ignoredFolders.has('food_icon_generation_pack'))
  assert.ok(ignoredFolders.has('icon_supplement_pack'))
  assert.ok(ignoredFolders.has('strict_icon_regen_pack'))
  assert.ok(ignoredFolders.has('宝宝食材小管家_缺失食材icon生成包_给Codex'))
  assert.ok(ignoredFiles.has('icon补充.zip'))
  assert.ok(ignoredFiles.has('宝宝食材小管家_缺失食材icon重生成_严格旧风格_给Codex.zip'))
})

test('project upload source stays under preview size budget', () => {
  const uploadBytes = collectUploadFiles()
    .reduce((total, file) => total + fs.statSync(file).size, 0)

  assert.ok(uploadBytes < 1900 * 1024, `upload source should stay below budget, got ${Math.round(uploadBytes / 1024)}KB`)
})
