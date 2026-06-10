// 错题集：把孩子答错的题保存在本机 chrome.storage.local，供后续复习。
// 移除规则：① 复习时连续答对 2 次自动移除；② 家长/孩子点「我学会了」手动移除。
import type { Question } from './types'

const KEY = 'kankan_wrongbook'
/** 最多保留多少道错题，超出后丢弃最旧的 */
const MAX = 300
/** 复习连续答对几轮后自动移出错题集的默认值（可在设置中调整） */
export const DEFAULT_MASTER_STREAK = 2

/** 一道错题 */
export interface WrongItem {
  /** 唯一 id */
  id: string
  /** 完整题目，便于原样复现 */
  question: Question
  /** 考核词 / 字（冗余，便于展示） */
  word: string
  /** 题型（冗余，便于展示） */
  type: string
  /** 首次加入时间 */
  addedTime: number
  /** 最近一次答错时间 */
  lastWrongTime: number
  /** 累计答错次数 */
  wrongCount: number
  /** 复习时的连续答对次数；达到设置的轮数后自动移除 */
  correctStreak: number
}

/** 同题去重的键：题型 + 词 */
function keyOf(q: Question): string {
  return `${q.type}::${q.word}`
}

/** 读取全部错题（按最近答错时间倒序） */
export async function getWrongItems(): Promise<WrongItem[]> {
  const data = await chrome.storage.local.get(KEY)
  const list = (data[KEY] || []) as WrongItem[]
  if (!Array.isArray(list)) return []
  return list.slice().sort((a, b) => b.lastWrongTime - a.lastWrongTime)
}

async function save(list: WrongItem[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: list.slice(-MAX) })
}

/** 加入错题集；同题（题型+词）已存在则累加错误次数并刷新题目，否则新增 */
export async function addWrong(q: Question): Promise<void> {
  const data = await chrome.storage.local.get(KEY)
  const list = (Array.isArray(data[KEY]) ? data[KEY] : []) as WrongItem[]
  const k = keyOf(q)
  const now = Date.now()
  const existing = list.find((w) => keyOf(w.question) === k)
  if (existing) {
    existing.wrongCount++
    existing.lastWrongTime = now
    existing.correctStreak = 0
    existing.question = q // 用最新题目刷新（选项可能不同）
    existing.word = q.word
    existing.type = q.type
  } else {
    list.push({
      id: `${now}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      question: q,
      word: q.word,
      type: q.type,
      addedTime: now,
      lastWrongTime: now,
      wrongCount: 1,
      correctStreak: 0
    })
  }
  await save(list)
}

/**
 * 复习答对：连续答对 +1，达到 masterStreak 则移出错题集。
 * @param masterStreak 连续答对几轮自动移除
 * @param autoRemove   是否启用「连续答对自动移除」；false 时只累加连对数、不移除
 * @returns 是否已经掌握并移除
 */
export async function markReviewCorrect(
  id: string,
  masterStreak: number = DEFAULT_MASTER_STREAK,
  autoRemove: boolean = true
): Promise<boolean> {
  const data = await chrome.storage.local.get(KEY)
  const list = (Array.isArray(data[KEY]) ? data[KEY] : []) as WrongItem[]
  const it = list.find((w) => w.id === id)
  if (!it) return false
  it.correctStreak++
  if (autoRemove && masterStreak >= 1 && it.correctStreak >= masterStreak) {
    await save(list.filter((w) => w.id !== id))
    return true
  }
  await save(list)
  return false
}

/** 复习答错：连续答对清零，累计错误次数 +1 */
export async function markReviewWrong(id: string): Promise<void> {
  const data = await chrome.storage.local.get(KEY)
  const list = (Array.isArray(data[KEY]) ? data[KEY] : []) as WrongItem[]
  const it = list.find((w) => w.id === id)
  if (!it) return
  it.correctStreak = 0
  it.wrongCount++
  it.lastWrongTime = Date.now()
  await save(list)
}

/** 「我学会了」/ 手动移除一道错题 */
export async function removeWrong(id: string): Promise<void> {
  const data = await chrome.storage.local.get(KEY)
  const list = (Array.isArray(data[KEY]) ? data[KEY] : []) as WrongItem[]
  await save(list.filter((w) => w.id !== id))
}

/** 清空错题集 */
export async function clearWrong(): Promise<void> {
  await chrome.storage.local.set({ [KEY]: [] })
}
