// pinyin-pro 封装：提供出题/校验所需的拼音工具
import { pinyin } from 'pinyin-pro'

/** 取单字带声调拼音，如 好 -> hǎo */
export function toPinyin(char: string): string {
  return pinyin(char, { toneType: 'symbol', type: 'string' }) || ''
}

/** 取声调数字 1-4，轻声返回 0。如 好 -> 3 */
export function toneOf(char: string): number {
  const num = pinyin(char, { toneType: 'num', type: 'string' }) // 如 hao3
  const m = num.match(/([0-5])/)
  if (!m) return 0
  const t = Number(m[1])
  return t === 5 ? 0 : t // pinyin-pro 轻声为 5，统一成 0
}

/** 取声母，如 你 -> n，啊 -> '' */
export function initialOf(char: string): string {
  return pinyin(char, { pattern: 'initial', type: 'string' }) || ''
}

/** 取不带声调的拼音（韵母+声母合体），如 好 -> hao */
export function plainPinyin(char: string): string {
  return pinyin(char, { toneType: 'none', type: 'string' }) || ''
}

/** 判断一个字符串是否是单个汉字 */
export function isHanzi(ch: string): boolean {
  return /^[一-龥]$/.test(ch)
}

/** 从一段文本里抽取所有不重复的汉字 */
export function uniqueHanzi(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ch of text) {
    if (isHanzi(ch) && !seen.has(ch)) {
      seen.add(ch)
      out.push(ch)
    }
  }
  return out
}

/** 常见声母表，用于声母题干扰项 */
export const ALL_INITIALS = [
  'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h',
  'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'
]

/** 易混声母组（平翘舌、鼻边音），用于难度较高时的声母干扰项 */
export const CONFUSABLE_INITIALS: Record<string, string[]> = {
  zh: ['z', 'ch', 'j'],
  z: ['zh', 'c', 'j'],
  ch: ['c', 'zh', 'q'],
  c: ['ch', 'z', 'q'],
  sh: ['s', 'x', 'zh'],
  s: ['sh', 'x', 'c'],
  n: ['l', 'm'],
  l: ['n', 'r'],
  f: ['h', 'b'],
  h: ['f', 'k'],
  r: ['l', 'y']
}

/**
 * 生成「近音」拼音干扰项：把带声调拼音做平翘舌 / 前后鼻音 / 声调替换，
 * 用于难度较高的「选拼音」题，让选项更接近、更需要仔细听辨。
 */
export function nearSoundVariants(py: string): string[] {
  const out = new Set<string>()
  const subs: [RegExp, string][] = [
    [/zh/g, 'z'], [/(?<![cs])z(?!h)/g, 'zh'],
    [/ch/g, 'c'], [/(?<![sz])c(?!h)/g, 'ch'],
    [/sh/g, 's'], [/(?<![cz])s(?!h)/g, 'sh'],
    [/ang/g, 'an'], [/(?<![a])an(?!g)/g, 'ang'],
    [/eng/g, 'en'], [/ing/g, 'in'],
    [/\bn/g, 'l'], [/\bl/g, 'n']
  ]
  for (const [re, rep] of subs) {
    const v = py.replace(re, rep)
    if (v !== py) out.add(v)
  }
  // 声调替换：把某个带调元音换成另一种声调
  const toneMap: Record<string, string[]> = {
    ā: ['á', 'ǎ', 'à'], á: ['ā', 'ǎ', 'à'], ǎ: ['ā', 'á', 'à'], à: ['ā', 'á', 'ǎ'],
    ō: ['ó', 'ǒ', 'ò'], ó: ['ō', 'ǒ', 'ò'], ǒ: ['ō', 'ó', 'ò'], ò: ['ō', 'ó', 'ǒ'],
    ē: ['é', 'ě', 'è'], é: ['ē', 'ě', 'è'], ě: ['ē', 'é', 'è'], è: ['ē', 'é', 'ě'],
    ī: ['í', 'ǐ', 'ì'], í: ['ī', 'ǐ', 'ì'], ǐ: ['ī', 'í', 'ì'], ì: ['ī', 'í', 'ǐ'],
    ū: ['ú', 'ǔ', 'ù'], ú: ['ū', 'ǔ', 'ù'], ǔ: ['ū', 'ú', 'ù'], ù: ['ū', 'ú', 'ǔ']
  }
  for (const ch of py) {
    const alts = toneMap[ch]
    if (alts) {
      for (const a of alts) out.add(py.replace(ch, a))
      break
    }
  }
  return Array.from(out).filter((v) => v && v !== py)
}
