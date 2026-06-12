const statusMap = {
  baby_ok: {
    text: '建议给宝宝吃',
    shortText: '宝宝可吃',
    adviceTitle: '建议给宝宝吃',
    advice: '当前仍在宝宝建议食用期内，建议充分清洗并做熟后食用。'
  },
  baby_today: {
    text: '建议今天给宝宝吃',
    shortText: '今天优先',
    adviceTitle: '建议今天给宝宝吃',
    advice: '已经接近宝宝建议期，建议今天优先做熟食用。'
  },
  adult_only: {
    text: '可留给大人吃',
    shortText: '成人参考',
    adviceTitle: '不建议继续作为宝宝辅食',
    advice: '超过宝宝建议期后，可留给大人根据外观、气味和触感判断是否食用。'
  },
  not_recommended: {
    text: '不建议给宝宝食用',
    shortText: '不建议宝宝',
    adviceTitle: '不建议给宝宝食用',
    advice: '如果已经出现发黄、发黏、出水、异味等情况，请不要给宝宝食用。'
  },
  expired: {
    text: '不建议继续食用',
    shortText: '建议处理',
    adviceTitle: '不建议继续食用',
    advice: '已经明显超过参考期限，建议谨慎处理。'
  },
  finished: {
    text: '已处理',
    shortText: '已处理',
    adviceTitle: '已处理',
    advice: '这条记录已处理，后续不再进入临期提醒。'
  }
}

function getStatus(status) {
  return statusMap[status] || statusMap.baby_ok
}

module.exports = {
  statusMap,
  getStatus
}
