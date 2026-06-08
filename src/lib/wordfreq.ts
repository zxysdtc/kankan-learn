// 纯前端「高频词 / 概念」提取：不依赖分词词典，用 n-gram 词频近似。
// 思路：把字幕按非汉字切成纯汉字片段，统计 2~3 字滑窗的出现次数，
// 过滤虚词，取重复出现的高频组合作为「视频里反复提到的词 / 概念」。

// 高频虚词 / 停用字：这些字自身或两两组合没有学习价值，需过滤。
const STOP = new Set(
  [...'的了是我不在他她它们你这那个上下来去到也就和与而又或被把让没有么呢吧啊呀哦嗯啦吗都还要会能可以这个那个什么怎么这样那样因为所以但是然后就是真的非常一个我们你们他们自己时候现在已经一直还是不是这些那些一些'].filter(
    (c) => /[一-龥]/.test(c)
  )
)

interface Cand {
  word: string
  count: number
}

function hanRuns(sentences: string[]): string[] {
  const runs: string[] = []
  for (const s of sentences) {
    const parts = s.split(/[^一-龥]+/).filter(Boolean)
    runs.push(...parts)
  }
  return runs
}

function isAllStop(word: string): boolean {
  return [...word].every((c) => STOP.has(c))
}

/**
 * 提取高频词。返回按「越高频、越长」排序的候选词（2~3字）。
 * @param sentences 原文句子数组
 * @param limit 返回数量上限
 */
export function topWords(sentences: string[], limit = 8): string[] {
  const runs = hanRuns(sentences)
  const counts = new Map<string, number>()

  for (const run of runs) {
    const arr = [...run]
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= arr.length; i++) {
        const w = arr.slice(i, i + n).join('')
        if (isAllStop(w)) continue
        // 首尾不应是纯虚词，减少「的话」「了我」这类无意义切片
        if (STOP.has(w[0]) || STOP.has(w[w.length - 1])) continue
        counts.set(w, (counts.get(w) || 0) + 1)
      }
    }
  }

  let cands: Cand[] = [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    // 至少出现 2 次才算「高频」
    .filter((c) => c.count >= 2)

  // 去碎片：若某短词只是更长词的一部分（更长词出现次数 >= 它），说明它几乎总是
  // 作为长词的片段出现（如「龙吃」来自「恐龙吃」），属于切词噪声，丢弃。
  cands = cands.filter((c) => {
    return !cands.some(
      (o) => o.word.length > c.word.length && o.word.includes(c.word) && o.count >= c.count
    )
  })

  cands.sort((a, b) => b.count - a.count || b.word.length - a.word.length)

  // 去重叠：已选词若与候选互为子串则跳过（保留更高频/更长的）
  const picked: string[] = []
  for (const c of cands) {
    if (picked.length >= limit) break
    if (picked.some((p) => p.includes(c.word) || c.word.includes(p))) continue
    picked.push(c.word)
  }
  return picked
}

/** 高频实词单字（用于声调 / 声母题），排除虚词 */
export function topChars(sentences: string[], limit = 6): string[] {
  const counts = new Map<string, number>()
  for (const run of hanRuns(sentences)) {
    for (const c of run) {
      if (STOP.has(c)) continue
      counts.set(c, (counts.get(c) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c)
}

/** 给一个词，在原文里找一句包含它的、长度适中的例句 */
export function findExample(word: string, sentences: string[]): string {
  const hit = sentences
    .filter((s) => s.includes(word))
    .sort((a, b) => Math.abs(a.length - 16) - Math.abs(b.length - 16)) // 偏好 ~16字的句子
  return hit[0] || ''
}
