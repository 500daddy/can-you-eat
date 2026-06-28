const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

test('mine profile card exposes baby info editing from the visible baby summary', () => {
  const markup = readText('pages/mine/index.wxml')
  const stylesheet = readText('pages/mine/index.wxss')

  assert.match(markup, /class="profile-card"[^>]+bindtap="goBaby"/)
  assert.match(markup, /settings\.babyAvatarImage/)
  assert.match(markup, /class="profile-avatar"[^>]+mode="aspectFill"/)
  assert.match(markup, /settings\.babyStageText/)
  assert.match(markup, /settings\.babyStageDescription/)
  assert.match(markup, /profile-stage-desc/)
  assert.doesNotMatch(markup, /Lv\.3/)
  assert.match(markup, /class="profile-edit"/)
  assert.match(markup, /编辑/)
  assert.doesNotMatch(markup, /宝宝成长徽章/)
  assert.doesNotMatch(markup, /achievement-card/)
  assert.doesNotMatch(markup, /achievements/)
  assert.match(stylesheet, /\.profile-edit/)
  assert.match(stylesheet, /\.profile-stage-desc/)
  assert.doesNotMatch(stylesheet, /\.achievement-card/)
})
