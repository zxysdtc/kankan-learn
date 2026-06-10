// 数学加减题本地生成器：纯函数、不联网、得数由本地计算保证绝对正确。
// 第一版覆盖「加法 / 减法（含进位、退位）」，按数值上限控制难度。
import type { MathArithmeticQuestion } from './types'

export interface MathGenOptions {
  /** 数值上限：操作数与得数都不超过它（如 20 / 100） */
  maxNumber: number
  /** 运算类型 */
  ops: 'add' | 'sub' | 'both'
  /** 是否优先出含进位/退位的题 */
  preferCarry: boolean
  /** 要生成多少道（题库大小） */
  count: number
}

function randInt(min: number, max: number): number {
  // [min, max] 闭区间
  return min + Math.floor(Math.random() * (max - min + 1))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 个位相加是否进位 */
function isCarryAdd(a: number, b: number): boolean {
  return (a % 10) + (b % 10) >= 10
}

/** 减法是否退位（被减数个位小于减数个位） */
function isBorrowSub(a: number, b: number): boolean {
  return a % 10 < b % 10
}

/** 生成一道加法：a + b，且 a、b、a+b 均在 [0, max] 内 */
function genAdd(max: number, preferCarry: boolean): { a: number; b: number; result: number } {
  for (let tries = 0; tries < 40; tries++) {
    const a = randInt(1, max - 1)
    const b = randInt(1, max - a)
    if (preferCarry && max > 10 && !isCarryAdd(a, b) && tries < 30) continue
    return { a, b, result: a + b }
  }
  const a = randInt(1, max - 1)
  const b = randInt(1, max - a)
  return { a, b, result: a + b }
}

/** 生成一道减法：a - b，b ≤ a ≤ max，得数 ≥ 0 */
function genSub(max: number, preferBorrow: boolean): { a: number; b: number; result: number } {
  for (let tries = 0; tries < 40; tries++) {
    const a = randInt(2, max)
    const b = randInt(1, a)
    if (preferBorrow && max > 10 && !isBorrowSub(a, b) && tries < 30) continue
    return { a, b, result: a - b }
  }
  const a = randInt(2, max)
  const b = randInt(1, a)
  return { a, b, result: a - b }
}

/** 为正确得数构造 3 个干扰项：贴近答案、不为负、互不相同 */
function buildOptions(correct: number, max: number): { options: number[]; answer: number } {
  const set = new Set<number>([correct])
  // 常见错位：±1、±2（计算疏忽）、±10（进退位错误）
  const candidates = shuffle([
    correct + 1,
    correct - 1,
    correct + 2,
    correct - 2,
    correct + 10,
    correct - 10
  ])
  for (const c of candidates) {
    if (set.size >= 4) break
    if (c >= 0 && c <= max + 10) set.add(c)
  }
  // 仍不足 4 个（极端小数值时），用随机数补足
  let guard = 0
  while (set.size < 4 && guard++ < 50) {
    const c = randInt(0, Math.max(max, correct + 5))
    set.add(c)
  }
  const options = shuffle(Array.from(set).slice(0, 4))
  return { options, answer: options.indexOf(correct) }
}

/** 把算式转成中文朗读文本，如「8 + 5」→「8 加 5 等于几」 */
export function exprToSpeech(expr: string): string {
  return expr.replace('+', '加').replace('-', '减') + ' 等于几'
}

/** 把算式 + 得数转成中文朗读文本，如「8 + 5」「13」→「8 加 5 等于 13」 */
export function answerToSpeech(expr: string, result: number): string {
  return `${expr.replace('+', '加').replace('-', '减')} 等于 ${result}`
}

/** 决定一道题用加还是减 */
function pickOp(ops: MathGenOptions['ops']): 'add' | 'sub' {
  if (ops === 'add') return 'add'
  if (ops === 'sub') return 'sub'
  return Math.random() < 0.5 ? 'add' : 'sub'
}

/**
 * 生成一批数学加减题（题库）。已对算式去重，得数本地计算保证正确。
 */
export function generateMathQuiz(opts: MathGenOptions): MathArithmeticQuestion[] {
  const max = Math.max(5, opts.maxNumber || 20)
  const need = Math.max(1, opts.count)
  const out: MathArithmeticQuestion[] = []
  const seen = new Set<string>()

  let guard = 0
  while (out.length < need && guard++ < need * 30) {
    const op = pickOp(opts.ops)
    const { a, b, result } =
      op === 'add' ? genAdd(max, opts.preferCarry) : genSub(max, opts.preferCarry)
    const sign = op === 'add' ? '+' : '-'
    const key = `${a}${sign}${b}`
    if (seen.has(key)) continue
    seen.add(key)

    const expr = `${a} ${sign} ${b}`
    const { options, answer } = buildOptions(result, max)
    out.push({
      type: 'math_arithmetic',
      word: key, // 错题集去重键 + 展示
      pinyin: '',
      example: '',
      expr,
      instruction: '算一算，得数是几？',
      promptAudio: exprToSpeech(expr),
      options,
      answer
    })
  }
  return out
}
