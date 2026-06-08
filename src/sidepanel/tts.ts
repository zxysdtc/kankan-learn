// 语音播报封装：优先 chrome.tts（系统离线中文语音），失败降级 speechSynthesis。
import { getConfig } from '../lib/config'

let cachedRate = 0.8
let cachedVolume = 1

export async function refreshTtsConfig() {
  const cfg = await getConfig()
  cachedRate = cfg.rate
  cachedVolume = cfg.volume
}

/** 朗读一段中文文本 */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!text) return resolve()
    try {
      chrome.tts.stop()
      chrome.tts.speak(text, {
        lang: 'zh-CN',
        rate: cachedRate,
        volume: cachedVolume,
        onEvent: (e) => {
          if (e.type === 'end' || e.type === 'interrupted' || e.type === 'error') {
            if (e.type === 'error') fallbackSpeak(text)
            resolve()
          }
        }
      })
    } catch {
      fallbackSpeak(text)
      resolve()
    }
  })
}

function fallbackSpeak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = cachedRate
    u.volume = cachedVolume
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch {
    /* ignore */
  }
}

export function stopSpeak() {
  try {
    chrome.tts.stop()
  } catch {}
  try {
    speechSynthesis.cancel()
  } catch {}
}

/** 把第几声读成「第一声」之类，用于声调题反馈 */
export function toneWord(tone: number): string {
  return ['轻声', '第一声', '第二声', '第三声', '第四声'][tone] || ''
}
