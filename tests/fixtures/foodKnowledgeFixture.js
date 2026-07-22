function createFoodKnowledgeFixture() {
  return {
    foods: [
      {
        foodId: 'tomato',
        canonicalName: '番茄',
        category: '蔬菜',
        subCategory: '茄果类',
        defaultState: 'raw_whole',
        allergenTags: [],
        riskTags: [],
        iconKey: 'tomato',
        status: 'active',
        revision: 1,
        reviewStatus: 'approved'
      }
    ],
    searchTerms: [
      {
        termId: 'tomato-canonical',
        foodId: 'tomato',
        term: '番茄',
        normalizedTerm: '番茄',
        type: 'canonical',
        region: '全国',
        weight: 100,
        reviewStatus: 'approved'
      },
      {
        termId: 'tomato-alias-xihongshi',
        foodId: 'tomato',
        term: '西红柿',
        normalizedTerm: '西红柿',
        type: 'alias',
        region: '全国',
        weight: 90,
        reviewStatus: 'approved'
      }
    ],
    evidenceSources: [
      {
        sourceId: 'source-general-storage',
        organization: '测试用政府机构',
        title: '测试用通用保存指引',
        url: 'https://example.test/general-storage',
        sourceType: 'government_guideline',
        locale: 'zh-CN',
        applicableScope: '测试用番茄切开冷藏保存',
        status: 'active'
      }
    ],
    storageRules: [
      {
        ruleId: 'tomato-cut-fridge-v1',
        foodId: 'tomato',
        foodState: 'cut',
        storageMethod: 'fridge',
        packageState: 'not_applicable',
        referenceDateType: 'cut_at',
        babyDaysMin: null,
        babyDaysMax: null,
        adultDaysMin: 1,
        adultDaysMax: 2,
        priority: 100,
        advice: '切开后密封冷藏，并尽快食用。',
        discardSigns: ['霉点', '异味', '发黏'],
        evidenceLevel: 'direct',
        evidenceBindings: [
          {
            sourceId: 'source-general-storage',
            audience: 'general',
            locator: '测试表格第 1 行'
          }
        ],
        reviewStatus: 'approved',
        ruleVersion: 1
      }
    ]
  }
}

module.exports = { createFoodKnowledgeFixture }
