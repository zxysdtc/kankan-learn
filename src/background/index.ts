// Service worker：协调 content / sidepanel，负责拉字幕、调 DeepSeek 出题。
import type { PanelState, SubtitleResult } from '../lib/types'
import { fetchSubtitleText, resolveCid } from '../lib/bili'
import { generateQuiz } from '../lib/llm'
import { getConfig } from '../lib/config'

interface TabState {
  video?: { bvid: string; cid: number; title: string }
  subtitle?: SubtitleResult
  panel: PanelState
  /** 当前已处理的 bvid-p，用于去重，避免重复拉取 */
  key?: string
}

const tabs = new Map<number, TabState>()

/** 从 B站视频 URL 解析 bvid 与分P序号 */
function parseBiliUrl(url: string): { bvid: string; p: number } | null {
  const m = url.match(/\/video\/(BV[0-9A-Za-z]+)/)
  if (!m) return null
  let p = 1
  try {
    p = Number(new URL(url).searchParams.get('p') || '1') || 1
  } catch {
    /* ignore */
  }
  return { bvid: m[1], p }
}

function ensureTab(tabId: number): TabState {
  let s = tabs.get(tabId)
  if (!s) {
    s = { panel: { phase: 'idle', subtitleReady: false } }
    tabs.set(tabId, s)
  }
  return s
}

function broadcastState(tabId: number) {
  const s = tabs.get(tabId)
  if (!s) return
  chrome.runtime
    .sendMessage({ type: 'STATE_UPDATE', tabId, state: s.panel })
    .catch(() => {})
}

// 点击扩展图标时，在当前窗口打开侧边栏
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {})
})

async function handleVideoDetected(
  tabId: number,
  detected: { bvid: string; p: number; title: string },
  force = false
) {
  const s = ensureTab(tabId)
  const key = `${detected.bvid}-${detected.p}`
  // 非强制时，同一视频且已在加载/已就绪则跳过，避免重复拉取
  if (
    !force &&
    s.key === key &&
    (s.panel.phase === 'subtitle_loading' || s.panel.phase === 'ready')
  ) {
    return
  }
  s.key = key
  s.subtitle = undefined
  s.panel = { phase: 'subtitle_loading', subtitleReady: false, videoTitle: detected.title }
  broadcastState(tabId)

  const resolved = await resolveCid(detected.bvid, detected.p)
  if (!resolved) {
    s.panel = {
      phase: 'error',
      subtitleReady: false,
      videoTitle: detected.title,
      error: '需要先登录B站，或者视频信息读取失败。'
    }
    broadcastState(tabId)
    return
  }
  const title = detected.title || resolved.title
  s.video = { bvid: detected.bvid, cid: resolved.cid, title }

  const result = await fetchSubtitleText(detected.bvid, resolved.cid)
  s.subtitle = result
  if (result.ok) {
    s.panel = { phase: 'ready', subtitleReady: true, videoTitle: title }
  } else {
    s.panel = {
      phase: 'error',
      subtitleReady: false,
      videoTitle: title,
      error: result.message
    }
  }
  broadcastState(tabId)
}

/** 主动/自动重新检测：直接读取标签页 URL，不依赖 content script */
async function handleRescan(tabId: number, force: boolean) {
  let tab: chrome.tabs.Tab
  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    return
  }
  const url = tab.url || ''
  const parsed = parseBiliUrl(url)
  if (!parsed) {
    const s = ensureTab(tabId)
    s.key = undefined
    s.panel = {
      phase: 'error',
      subtitleReady: false,
      error: '请先在B站打开一个视频页面，再点这里。'
    }
    broadcastState(tabId)
    return
  }
  const title = (tab.title || '').replace(/_哔哩哔哩.*/, '').trim()
  await handleVideoDetected(tabId, { ...parsed, title }, force)
}

chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  // 来自 content script 的消息带 sender.tab
  const senderTabId = sender.tab?.id

  if (msg?.type === 'VIDEO_DETECTED' && senderTabId != null) {
    handleVideoDetected(senderTabId, msg.video)
    return
  }

  if (msg?.type === 'VIDEO_ENDED' && senderTabId != null) {
    const s = ensureTab(senderTabId)
    if (s.panel.phase === 'ready' || s.panel.phase === 'video_ended') {
      s.panel = { ...s.panel, phase: 'video_ended' }
      broadcastState(senderTabId)
    }
    return
  }

  // 侧边栏「重新检测视频」按钮
  if (msg?.type === 'RESCAN' && msg.tabId != null) {
    handleRescan(msg.tabId, true).then(() => sendResponse({ ok: true }))
    return true
  }

  // 来自 side panel 的消息带 msg.tabId
  if (msg?.type === 'GET_STATE') {
    const s = tabs.get(msg.tabId)
    sendResponse(s?.panel ?? { phase: 'idle', subtitleReady: false })
    return true
  }

  if (msg?.type === 'START_QUIZ') {
    ;(async () => {
      const s = tabs.get(msg.tabId)
      if (!s?.subtitle?.ok || !s.subtitle.text) {
        sendResponse({ ok: false, message: '还没有拿到字幕，先打开一个有字幕的视频吧。' })
        return
      }
      s.panel = { ...s.panel, phase: 'quiz_loading' }
      broadcastState(msg.tabId)
      const cfg = await getConfig()
      const result = await generateQuiz(
        cfg,
        s.subtitle.text,
        s.subtitle.sentences ?? s.subtitle.text.split('\n')
      )
      // 出完题把面板状态回到 ready（侧边栏自己进入答题界面）
      s.panel = { ...s.panel, phase: 'ready' }
      broadcastState(msg.tabId)
      sendResponse(result)
    })()
    return true // 异步响应
  }

  return false
})

// 自动检测：B站是单页应用，切视频时 URL 变化会触发 onUpdated（content script
// 偶尔捕捉不到路由变化，这里作为补强，去重后自动拉字幕）。
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return
  if (!parseBiliUrl(changeInfo.url)) return
  handleRescan(tabId, false)
})

// 标签关闭时清理
chrome.tabs.onRemoved.addListener((tabId) => tabs.delete(tabId))
