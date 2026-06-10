// 孩子做题记录：保存在本机 chrome.storage.local，供家长在设置页查看。
import type { Difficulty } from './types'

const KEY = 'kankan_records'
/** 最多保留多少条历史记录，超出后丢弃最旧的 */
const MAX_RECORDS = 200

/** 单题作答明细 */
export interface RecordDetail {
  /** 考核的词 / 字 */
  word: string
  /** 题型 */
  type: string
  /** 是否第一次就答对（中途未点错） */
  firstTry: boolean
}

/** 一次完整答题的记录 */
export interface QuizRecord {
  /** 唯一 id（时间戳 + 随机串） */
  id: string
  /** 完成时间（毫秒时间戳） */
  time: number
  /** 视频标题 */
  videoTitle: string
  /** 难度档 */
  difficulty: Difficulty
  /** 本次题目总数 */
  total: number
  /** 第一次就答对的题数 */
  correct: number
  /** 总的点错次数（含同一题多次） */
  wrongAttempts: number
  /** 每道题的作答明细 */
  details: RecordDetail[]
}

/** 读取全部记录（按时间倒序，最新在前） */
export async function getRecords(): Promise<QuizRecord[]> {
  const data = await chrome.storage.local.get(KEY)
  const list = (data[KEY] || []) as QuizRecord[]
  return Array.isArray(list) ? list.slice().sort((a, b) => b.time - a.time) : []
}

/** 追加一条记录 */
export async function addRecord(rec: Omit<QuizRecord, 'id'>): Promise<void> {
  const data = await chrome.storage.local.get(KEY)
  const list = (data[KEY] || []) as QuizRecord[]
  const id = `${rec.time}-${Math.floor(Math.random() * 1e6).toString(36)}`
  const next = [...(Array.isArray(list) ? list : []), { ...rec, id }]
  // 只保留最近 MAX_RECORDS 条
  const trimmed = next.slice(-MAX_RECORDS)
  await chrome.storage.local.set({ [KEY]: trimmed })
}

/** 清空全部记录 */
export async function clearRecords(): Promise<void> {
  await chrome.storage.local.set({ [KEY]: [] })
}
