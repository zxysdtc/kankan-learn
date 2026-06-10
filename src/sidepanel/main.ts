// 侧边栏主控：跟踪当前B站标签状态，渲染首页/答题界面。
import type { PanelState, Question, QuizResult } from '../lib/types'
import { refreshTtsConfig, speak, stopSpeak } from './tts'
import { setSfxVolume } from './sfx'
import { startQuiz } from './quiz'
import { getConfig } from '../lib/config'
import { getRecords, clearRecords, type QuizRecord } from '../lib/records'
import {
  getWrongItems,
  addWrong,
  markReviewCorrect,
  markReviewWrong,
  removeWrong,
  clearWrong,
  type WrongItem
} from '../lib/wrongbook'

const screen = document.getElementById('screen') as HTMLElement
let activeTabId: number | null = null
let curState: PanelState = { phase: 'idle', subtitleReady: false }
let inQuiz = false
let wrongCount = 0
/** 侧边栏当前视图：主界面 / 做题记录 / 错题本 */
let viewMode: 'main' | 'records' | 'wrongbook' = 'main'

async function refreshWrongCount() {
  wrongCount = (await getWrongItems()).length
}

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
  await refreshWrongCount()
  await resolveActiveTab()
  // 跟随用户切换标签
  chrome.tabs.onActivated.addListener(async () => {
    inQuiz = false
    viewMode = 'main'
    await resolveActiveTab()
  })
  // 接收 background 广播
  chrome.runtime.onMessage.addListener((msg: any) => {
    if (msg?.type === 'STATE_UPDATE' && msg.tabId === activeTabId) {
      curState = msg.state
      // 正在答题或正在看记录/错题本时，不被状态广播打断
      if (!inQuiz && viewMode === 'main') render()
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
  // 记录 / 错题本视图优先
  if (viewMode === 'records') {
    renderRecordsView()
    return
  }
  if (viewMode === 'wrongbook') {
    renderWrongbookView()
    return
  }
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
    mountHomeExtras()
    return
  }
  switch (curState.phase) {
    case 'subtitle_loading':
      screen.innerHTML = loadingView('正在准备这个视频…', '📺')
      break
    case 'error':
      screen.innerHTML = homeView('🤔', '哎呀', curState.error || '出了点小问题，换个视频试试吧。')
      mountHomeExtras()
      break
    case 'ready':
    case 'video_ended':
      renderReady()
      break
    default:
      screen.innerHTML = loadingView('准备中…', '⏳')
  }
}

/** 首页/就绪页挂上「错题本 / 做题记录」入口 */
function mountHomeExtras() {
  if (inQuiz) return
  const home = screen.querySelector('.home')
  if (!home) return
  const bar = document.createElement('div')
  bar.className = 'home-extras'
  if (wrongCount > 0) {
    const wb = document.createElement('button')
    wb.className = 'ghost-btn entry wrong-entry'
    wb.textContent = `📒 错题本（${wrongCount}）`
    wb.onclick = () => {
      viewMode = 'wrongbook'
      render()
    }
    bar.appendChild(wb)
  }
  const rec = document.createElement('button')
  rec.className = 'ghost-btn entry'
  rec.textContent = '📊 做题记录'
  rec.onclick = () => {
    viewMode = 'records'
    render()
  }
  bar.appendChild(rec)
  home.appendChild(bar)
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
  mountHomeExtras()
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
  const cfg = await getConfig()
  startQuiz(screen, result.questions, {
    count: cfg.questionCount,
    autoPlay: cfg.autoPlayAudio,
    difficulty: cfg.difficulty,
    videoTitle: curState.videoTitle || '',
    mode: 'normal',
    // 答错的题加入错题集
    onWrong: (q) => {
      addWrong(q).catch(() => {})
    },
    onFinish: async () => {
      inQuiz = false
      await refreshWrongCount()
      render()
    }
  })
}

/** 错题复习流程：取出全部错题，进入复习模式答题 */
async function startReviewFlow() {
  const items = await getWrongItems()
  if (!items.length) {
    await refreshWrongCount()
    render()
    return
  }
  const cfg = await getConfig()
  // 用题目对象引用映射回错题 id，便于答题后更新错题集
  const idMap = new Map<Question, string>()
  const pool: Question[] = items.map((it) => {
    idMap.set(it.question, it.id)
    return it.question
  })
  inQuiz = true
  startQuiz(screen, pool, {
    count: Math.min(pool.length, 12),
    autoPlay: cfg.autoPlayAudio,
    difficulty: cfg.difficulty,
    videoTitle: '错题复习',
    mode: 'review',
    // 一遍答对 → 连续答对+1（满设置的轮数自动移除）；中途答错 → 连续答对清零
    onQuestionDone: (q, firstTry) => {
      const id = idMap.get(q)
      if (!id) return
      if (firstTry)
        markReviewCorrect(id, cfg.wrongbookMasterStreak, cfg.wrongbookAutoRemove).catch(() => {})
      else markReviewWrong(id).catch(() => {})
    },
    // 「我学会了」→ 直接移出错题集
    onLearned: (q) => {
      const id = idMap.get(q)
      if (id) removeWrong(id).catch(() => {})
    },
    onFinish: async () => {
      inQuiz = false
      await refreshWrongCount()
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

// ---------- 做题记录 / 错题本 视图 ----------
const DIFF_LABEL: Record<number, string> = { 1: '🌱简单', 2: '🌿中等', 3: '🌳挑战' }
const TYPE_LABEL: Record<string, string> = {
  listen_choose_word: '听词选词',
  choose_pinyin: '选拼音',
  tone_select: '声调',
  initial_select: '选声母'
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function bindBack() {
  const b = screen.querySelector('#back') as HTMLButtonElement | null
  if (b)
    b.onclick = () => {
      viewMode = 'main'
      render()
    }
}

function recordCardHtml(r: QuizRecord): string {
  const acc = r.total ? Math.round((r.correct / r.total) * 100) : 0
  const title = r.videoTitle ? esc(r.videoTitle) : '（未知视频）'
  return `
    <div class="rec-item">
      <div class="rec-head">
        <span class="rec-title" title="${title}">${title}</span>
        <span class="rec-time">${fmtTime(r.time)}</span>
      </div>
      <div class="rec-meta">
        <span class="rec-score">一遍答对 ${r.correct}/${r.total}（${acc}%）</span>
        <span>${DIFF_LABEL[r.difficulty] || ''}</span>
        <span>点错 ${r.wrongAttempts} 次</span>
      </div>
    </div>`
}

function wrongCardHtml(it: WrongItem): string {
  const typeLabel = TYPE_LABEL[it.type] || it.type
  return `
    <div class="rec-item">
      <div class="rec-head">
        <span class="rec-title"><b class="wrong-word">${esc(it.word)}</b> <span class="wrong-type">${typeLabel}</span></span>
        <button class="rec-remove" data-id="${it.id}">我学会了</button>
      </div>
      <div class="rec-meta">
        <span>答错 ${it.wrongCount} 次</span>
        <span>已连对 ${it.correctStreak}</span>
        <span class="rec-time">${fmtTime(it.lastWrongTime)}</span>
      </div>
    </div>`
}

async function renderRecordsView() {
  const list = await getRecords()
  let body: string
  if (!list.length) {
    body = '<div class="rec-empty">还没有做题记录，孩子玩过小游戏后这里会显示。</div>'
  } else {
    const totalQ = list.reduce((s, r) => s + r.total, 0)
    const totalCorrect = list.reduce((s, r) => s + r.correct, 0)
    const acc = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0
    const summary = `<div class="list-summary">共玩 <b>${list.length}</b> 轮 / <b>${totalQ}</b> 题，一遍答对率 <b>${acc}%</b></div>`
    const items = list.slice(0, 50).map(recordCardHtml).join('')
    body = `${summary}<div class="list-items">${items}</div><button class="ghost-btn small clear-btn" id="clear">🗑️ 清空记录</button>`
  }
  screen.innerHTML = `<div class="list-view"><div class="list-head"><button class="back-btn" id="back">← 返回</button><span class="list-title">📊 做题记录</span></div>${body}</div>`
  bindBack()
  const clr = screen.querySelector('#clear') as HTMLButtonElement | null
  if (clr)
    clr.onclick = async () => {
      await clearRecords()
      render()
    }
}

async function renderWrongbookView() {
  const list = await getWrongItems()
  wrongCount = list.length
  let body: string
  if (!list.length) {
    body = '<div class="rec-empty">还没有错题，太棒啦！</div>'
  } else {
    const actions = `<div class="list-actions"><button class="primary-btn small" id="review">📕 开始复习</button><button class="ghost-btn small" id="clear">清空</button></div>`
    const items = list.map(wrongCardHtml).join('')
    body = `${actions}<div class="list-items">${items}</div>`
  }
  screen.innerHTML = `<div class="list-view"><div class="list-head"><button class="back-btn" id="back">← 返回</button><span class="list-title">📒 错题本</span></div>${body}</div>`
  bindBack()
  const rv = screen.querySelector('#review') as HTMLButtonElement | null
  if (rv)
    rv.onclick = () => {
      viewMode = 'main'
      startReviewFlow()
    }
  const clr = screen.querySelector('#clear') as HTMLButtonElement | null
  if (clr)
    clr.onclick = async () => {
      await clearWrong()
      await refreshWrongCount()
      render()
    }
  screen.querySelectorAll('.rec-remove').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = (b as HTMLElement).dataset.id
      if (!id) return
      await removeWrong(id)
      await refreshWrongCount()
      render()
    })
  })
}

init()
