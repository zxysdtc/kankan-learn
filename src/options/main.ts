import { getConfig, saveConfig } from '../lib/config'
import type { Difficulty } from '../lib/types'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const preset = $<HTMLSelectElement>('preset')
const baseUrl = $<HTMLInputElement>('baseUrl')
const model = $<HTMLInputElement>('model')
const apiKey = $<HTMLInputElement>('apiKey')
const count = $<HTMLInputElement>('count')
const difficultyBox = $<HTMLElement>('difficulty')
const autoplayBox = $<HTMLElement>('autoplay')
const autoremoveBox = $<HTMLElement>('autoremove')
const streak = $<HTMLInputElement>('streak')
const streakField = $<HTMLElement>('streak-field')
const volume = $<HTMLInputElement>('volume')
const rate = $<HTMLInputElement>('rate')
const volVal = $<HTMLElement>('volVal')
const rateVal = $<HTMLElement>('rateVal')
const status = $<HTMLElement>('status')

const PRESETS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
}

let difficulty: Difficulty = 1
let autoPlay = true
let autoRemove = true

async function load() {
  const cfg = await getConfig()
  baseUrl.value = cfg.apiBaseUrl
  model.value = cfg.apiModel
  apiKey.value = cfg.apiKey
  count.value = String(cfg.questionCount)
  volume.value = String(cfg.volume)
  rate.value = String(cfg.rate)
  difficulty = cfg.difficulty
  autoPlay = cfg.autoPlayAudio
  autoRemove = cfg.wrongbookAutoRemove
  streak.value = String(cfg.wrongbookMasterStreak)
  preset.value = detectPreset(cfg.apiBaseUrl, cfg.apiModel)
  syncDifficulty()
  syncAutoplay()
  syncAutoremove()
  syncLabels()
}

function detectPreset(b: string, m: string): string {
  if (b === PRESETS.deepseek.baseUrl && m === PRESETS.deepseek.model) return 'deepseek'
  if (b === PRESETS.openai.baseUrl && m === PRESETS.openai.model) return 'openai'
  return 'custom'
}

function syncLabels() {
  volVal.textContent = Math.round(Number(volume.value) * 100) + '%'
  rateVal.textContent = Number(rate.value).toFixed(1) + '×'
}

function syncDifficulty() {
  difficultyBox.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', Number((b as HTMLButtonElement).dataset.v) === difficulty)
  })
}

function syncAutoplay() {
  autoplayBox.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', Number((b as HTMLButtonElement).dataset.v) === (autoPlay ? 1 : 0))
  })
}

autoplayBox.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    autoPlay = Number((b as HTMLButtonElement).dataset.v) === 1
    syncAutoplay()
  })
})

function syncAutoremove() {
  autoremoveBox.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', Number((b as HTMLButtonElement).dataset.v) === (autoRemove ? 1 : 0))
  })
  // 关闭自动移除时，隐藏「连续答对几轮」输入
  streakField.style.display = autoRemove ? '' : 'none'
}

autoremoveBox.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    autoRemove = Number((b as HTMLButtonElement).dataset.v) === 1
    syncAutoremove()
  })
})

preset.addEventListener('change', () => {
  const p = PRESETS[preset.value]
  if (p) {
    baseUrl.value = p.baseUrl
    model.value = p.model
  }
})

difficultyBox.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    difficulty = Number((b as HTMLButtonElement).dataset.v) as Difficulty
    syncDifficulty()
  })
})

volume.addEventListener('input', syncLabels)
rate.addEventListener('input', syncLabels)

$('save').addEventListener('click', async () => {
  const c = Math.min(8, Math.max(2, Number(count.value) || 4))
  const s = Math.min(5, Math.max(1, Number(streak.value) || 2))
  await saveConfig({
    apiKey: apiKey.value.trim(),
    apiBaseUrl: baseUrl.value.trim(),
    apiModel: model.value.trim() || 'deepseek-chat',
    questionCount: c,
    difficulty,
    volume: Number(volume.value),
    rate: Number(rate.value),
    autoPlayAudio: autoPlay,
    wrongbookAutoRemove: autoRemove,
    wrongbookMasterStreak: s
  })
  status.textContent = '已保存 ✓'
  setTimeout(() => (status.textContent = ''), 2000)
})

$('test').addEventListener('click', () => {
  const text = '你好，我们一起来学拼音吧！'
  try {
    chrome.tts.stop()
    chrome.tts.speak(text, {
      lang: 'zh-CN',
      rate: Number(rate.value),
      volume: Number(volume.value)
    })
  } catch {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = Number(rate.value)
    u.volume = Number(volume.value)
    speechSynthesis.speak(u)
  }
})

load()
