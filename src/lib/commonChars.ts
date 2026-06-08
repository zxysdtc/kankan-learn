// 常用汉字表（按大致频率排列，约 500 字）。
// 用途：
//  1) 作为听音选字 / 看图选拼音题的干扰项来源；
//  2) 离线兜底出题时，挑「不是最最常见、但也不生僻」的字作为生字。
// 注：这是一个精简版常用字集，覆盖小学阶段大量字词，足够本扩展使用。

export const COMMON_CHARS =
  '的一是了我不人在他有这个上们来到时大地为子中你说生国年着' +
  '就那和要她出也得里后自以会家可下而过天去能对小多然于心学' +
  '么之都好看起发当没成只如事把还用第样道想作种开美总从无情' +
  '己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老' +
  '因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感' +
  '见明问力理尔点文几定本公特做外孩相西果走将月十实向声车全' +
  '信重三机工物气每并别真打太新比才便夫再书部水像眼等体却加' +
  '电主界门利海受听表德少克代员许稜先口由死安写性马光白或住' +
  '难望教命花结乐色更拉东神记处让母父应直字场平报友关放至张' +
  '认接告入笑内英军候民岁往何度山觉路带万男边风解叫任金快原' +
  '吃妈呢爸花草树叶雨雪云星月日水火土山石田禾米目耳口手足牛' +
  '羊鸟鱼虫犬马猪兔猫狗鸡鸭鹅虎象熊鹿蛇龟蛙蚁蜂蝶鸽燕雀莺鹊' +
  '春夏秋冬早晚朝夕昼夜寒暑温凉冷暖晴阴雷电虹霜露冰泉江河湖海' +
  '红黄蓝绿紫橙青灰黑白彩亮暗深浅鲜艳净脏圆方尖扁粗细软硬甜苦'

const COMMON_SET = new Set([...COMMON_CHARS])

/** 是否属于常用字 */
export function isCommon(ch: string): boolean {
  return COMMON_SET.has(ch)
}

/** 随机取 n 个不在 exclude 里的常用字，作为干扰项 */
export function pickDistractors(exclude: string[], n: number): string[] {
  const ex = new Set(exclude)
  const pool = [...COMMON_CHARS].filter((c) => !ex.has(c))
  const out: string[] = []
  // 简单的伪随机洗牌取样（不依赖 Math.random 的时间种子也可，这里允许）
  while (out.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

// 常用词语，用作「听词选词」题的兜底干扰项（当同视频的其它高频词不够时）。
export const COMMON_WORDS = [
  '朋友', '老师', '同学', '妈妈', '爸爸', '今天', '明天', '太阳', '月亮', '星星',
  '苹果', '香蕉', '西瓜', '小鸟', '小猫', '小狗', '森林', '河流', '大海', '高山',
  '故事', '游戏', '快乐', '勇敢', '聪明', '美丽', '飞机', '汽车', '火车', '轮船',
  '春天', '夏天', '秋天', '冬天', '颜色', '声音', '世界', '动物', '植物', '天空'
]

/** 取 n 个不在 exclude 里的常用词，作为词语题干扰项 */
export function pickWordDistractors(exclude: string[], n: number): string[] {
  const ex = new Set(exclude)
  const pool = COMMON_WORDS.filter((w) => !ex.has(w))
  const out: string[] = []
  while (out.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}
