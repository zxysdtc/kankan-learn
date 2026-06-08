// 注入到 B站视频页：检测当前视频(bvid/分P)、监听切换与「播放结束」。
// content script 处于隔离世界，无法读取页面 __INITIAL_STATE__，
// 因此 bvid 从 URL 解析，cid 交给 background 调接口解析。

let lastKey = ''
let videoBound: HTMLVideoElement | null = null

function parseVideo(): { bvid: string; p: number; title: string } | null {
  const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)
  if (!m) return null
  const bvid = m[1]
  const params = new URLSearchParams(location.search)
  const p = Number(params.get('p') || '1') || 1
  const title = (document.title || '').replace(/_哔哩哔哩.*/, '').trim()
  return { bvid, p, title }
}

function notifyVideo() {
  const info = parseVideo()
  if (!info) return
  const key = `${info.bvid}-${info.p}`
  if (key === lastKey) return
  lastKey = key
  chrome.runtime.sendMessage({ type: 'VIDEO_DETECTED', video: info }).catch(() => {})
  bindVideoEnded()
}

function bindVideoEnded() {
  // 视频元素可能尚未出现或被替换，定时尝试绑定
  const tryBind = () => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    if (v && v !== videoBound) {
      videoBound = v
      v.addEventListener('ended', () => {
        chrome.runtime.sendMessage({ type: 'VIDEO_ENDED' }).catch(() => {})
      })
    }
  }
  tryBind()
  let tries = 0
  const t = setInterval(() => {
    tryBind()
    if (++tries > 10 || videoBound) clearInterval(t)
  }, 1000)
}

// 监听 SPA 路由变化
function hookHistory() {
  const fire = () => setTimeout(notifyVideo, 600)
  const _push = history.pushState
  history.pushState = function (...args) {
    // @ts-ignore
    const r = _push.apply(this, args)
    fire()
    return r
  }
  const _replace = history.replaceState
  history.replaceState = function (...args) {
    // @ts-ignore
    const r = _replace.apply(this, args)
    fire()
    return r
  }
  window.addEventListener('popstate', fire)
}

hookHistory()
// 初次进入
setTimeout(notifyVideo, 800)
