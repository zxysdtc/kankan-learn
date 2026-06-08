// 侧边栏主控：跟踪当前B站标签状态，渲染首页/答题界面。
import type { PanelState, QuizResult } from '../lib/types'
import { refreshTtsConfig, speak, stopSpeak } from './tts'
import { setSfxVolume } from './sfx'
import { startQuiz } from './quiz'
import { getConfig } from '../lib/config'

const screen = document.getElementById('screen') as HTMLElement
let activeTabId: number | null = null
let curState: PanelState = { phase: 'idle', subtitleReady: false }
let inQuiz = false

async function init() {
  // 顶栏「设置」按钮 → 打开选项页
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })
  // 顶栏「重新检测视频」按钮
  document.getElementById('rescan-btn')?.addEventListener('click', rescan)
  await refreshTtsConfig()
  const cfg = await getConfig()
  setSfxVolume(cfg.volume)
  await resolveActiveTab()
  // 跟随用户切换标签
  chrome.tabs.onActivated.addListener(async () => {
    inQuiz = false
    await resolveActiveTab()
  })
  // 接收 background 广播
  chrome.runtime.onMessage.addListener((msg: any) => {
    if (msg?.type === 'STATE_UPDATE' && msg.tabId === activeTabId) {
      curState = msg.state
      if (!inQuiz) render()
    }
  })
}

/** 主动重新检测当前标签页的视频并拉字幕 */
async function rescan() {
  inQuiz = false
  const btn = document.getElementById('rescan-btn')
  btn?.classList.add('spinning')
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  activeTabId = tab?.id ?? null
  if (activeTabId == null) {
    btn?.classList.remove('spinning')
    return
  }
  curState = { phase: 'subtitle_loading', subtitleReady: false }
  render()
  await chrome.runtime.sendMessage({ type: 'RESCAN', tabId: activeTabId }).catch(() => {})
  // 结果会通过 STATE_UPDATE 广播回来；这里只负责停止转圈
  setTimeout(() => btn?.classList.remove('spinning'), 800)
}

async function resolveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  activeTabId = tab?.id ?? null
  if (activeTabId == null) {
    curState = { phase: 'idle', subtitleReady: false }
    render()
    return
  }
  const state = await chrome.runtime
    .sendMessage({ type: 'GET_STATE', tabId: activeTabId })
    .catch(() => null)
  curState = state || { phase: 'idle', subtitleReady: false }
  render()
}

function isBiliVideo(): boolean {
  return curState.phase !== 'idle'
}

function render() {
  stopSpeak()
  if (curState.phase === 'quiz_loading') {
    screen.innerHTML = loadingView('正在出题，等一下下…', '🧩')
    return
  }
  if (!isBiliVideo()) {
    screen.innerHTML = homeView(
      '👋',
      '一起来学拼音吧！',
      '打开B站，点开一个有字幕的视频，看完就能来玩小游戏啦。如果打开视频后这里没反应，点右上角 🔄 重新检测。'
    )
    return
  }
  switch (curState.phase) {
    case 'subtitle_loading':
      screen.innerHTML = loadingView('正在准备这个视频…', '📺')
      break
    case 'error':
      screen.innerHTML = homeView('🤔', '哎呀', curState.error || '出了点小问题，换个视频试试吧。')
      break
    case 'ready':
    case 'video_ended':
      renderReady()
      break
    default:
      screen.innerHTML = loadingView('准备中…', '⏳')
  }
}

function renderReady() {
  const ended = curState.phase === 'video_ended'
  screen.innerHTML = `
    <div class="home">
      <div class="big-emoji">${ended ? '🎬' : '✅'}</div>
      <div class="home-title">${ended ? '视频看完啦！' : '视频准备好啦！'}</div>
      <div class="home-sub">${curState.videoTitle ? esc(curState.videoTitle) : ''}</div>
      <button id="start" class="primary-btn huge">🎮 我看完啦，开始玩！</button>
      <p class="tip">看完视频后点上面的大按钮，做几道小游戏～</p>
    </div>`
  const btn = screen.querySelector('#start') as HTMLButtonElement
  btn.onclick = startQuizFlow
  if (ended) speak('视频看完啦，我们来玩游戏吧！')
}

async function startQuizFlow() {
  if (activeTabId == null) return
  screen.innerHTML = loadingView('正在出题，等一下下…', '🧩')
  speak('正在准备题目，马上就好')
  const result: QuizResult = await chrome.runtime
    .sendMessage({ type: 'START_QUIZ', tabId: activeTabId })
    .catch(() => ({ ok: false, message: '出题失败了，再试一次吧。' }))

  if (!result.ok || !result.questions || !result.questions.length) {
    screen.innerHTML = homeView('😅', '没出成题', result.message || '再试一次吧。')
    return
  }
  if (result.fallback && result.message) {
    // 用了离线兜底题，仅做轻提示，不打断
    speak(result.message)
  }
  inQuiz = true
  startQuiz(screen, result.questions, {
    onFinish: () => {
      inQuiz = false
      render()
    }
  })
}

// ---------- 视图模板 ----------
function homeView(emoji: string, title: string, sub: string): string {
  return `
    <div class="home">
      <div class="big-emoji">${emoji}</div>
      <div class="home-title">${title}</div>
      <div class="home-sub">${esc(sub)}</div>
    </div>`
}

function loadingView(text: string, emoji: string): string {
  return `
    <div class="home">
      <div class="big-emoji spin">${emoji}</div>
      <div class="home-title">${text}</div>
    </div>`
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

init()
