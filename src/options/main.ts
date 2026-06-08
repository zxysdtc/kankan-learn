import { getConfig, saveConfig } from '../lib/config'
import type { Difficulty } from '../lib/types'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const preset = $<HTMLSelectElement>('preset')
const baseUrl = $<HTMLInputElement>('baseUrl')
const model = $<HTMLInputElement>('model')
const apiKey = $<HTMLInputElement>('apiKey')
const count = $<HTMLInputElement>('count')
const difficultyBox = $<HTMLElement>('difficulty')
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

async function load() {
  const cfg = await getConfig()
  baseUrl.value = cfg.apiBaseUrl
  model.value = cfg.apiModel
  apiKey.value = cfg.apiKey
  count.value = String(cfg.questionCount)
  volume.value = String(cfg.volume)
  rate.value = String(cfg.rate)
  difficulty = cfg.difficulty
  preset.value = detectPreset(cfg.apiBaseUrl, cfg.apiModel)
  syncDifficulty()
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
  await saveConfig({
    apiKey: apiKey.value.trim(),
    apiBaseUrl: baseUrl.value.trim(),
    apiModel: model.value.trim() || 'deepseek-chat',
    questionCount: c,
    difficulty,
    volume: Number(volume.value),
    rate: Number(rate.value)
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
