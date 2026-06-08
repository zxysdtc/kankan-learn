// B站字幕获取。注意：本文件中的网络请求只能在 background service worker 中执行，
// 这样 fetch 才会带上用户登录 B站 的 Cookie（credentials: 'include'），并且不受 content
// script 的跨域限制。
import type { SubtitleResult } from './types'

interface PlayerSubtitleItem {
  id: number
  lan: string // zh-CN / ai-zh / en ...
  lan_doc: string
  subtitle_url: string // 以 // 开头
}

/**
 * 根据 bvid 解析 cid（content script 处于隔离世界，拿不到页面 __INITIAL_STATE__，
 * 因此由 background 调 view 接口解析）。p 为分P序号（从 1 开始）。
 */
export async function resolveCid(
  bvid: string,
  p = 1
): Promise<{ cid: number; title: string } | null> {
  try {
    const resp = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
      { credentials: 'include', headers: { Referer: 'https://www.bilibili.com' } }
    )
    const json = await resp.json()
    if (json?.code !== 0 || !json.data) return null
    const data = json.data
    const pages: any[] = data.pages ?? []
    const page = pages[p - 1]
    const cid = page?.cid ?? data.cid
    const title = page?.part || data.title || ''
    return cid ? { cid, title } : null
  } catch {
    return null
  }
}

/** 调 player/wbi/v2 拿字幕列表，挑选最佳字幕并拉取全文 */
export async function fetchSubtitleText(bvid: string, cid: number): Promise<SubtitleResult> {
  let playerJson: any
  try {
    const url = `https://api.bilibili.com/x/player/wbi/v2?bvid=${encodeURIComponent(
      bvid
    )}&cid=${cid}`
    const resp = await fetch(url, {
      credentials: 'include',
      headers: { Referer: 'https://www.bilibili.com' }
    })
    playerJson = await resp.json()
  } catch (e) {
    return { ok: false, reason: 'network', message: '获取字幕信息失败，请检查网络。' }
  }

  if (!playerJson || playerJson.code !== 0 || !playerJson.data) {
    // -101 等通常是未登录
    return {
      ok: false,
      reason: 'need_login',
      message: '需要先登录B站才能获取字幕哦。'
    }
  }

  const data = playerJson.data
  if (data.need_login_subtitle) {
    return { ok: false, reason: 'need_login', message: '需要先登录B站才能获取字幕哦。' }
  }

  const subtitles: PlayerSubtitleItem[] = data?.subtitle?.subtitles ?? []
  if (!subtitles.length) {
    return { ok: false, reason: 'no_subtitle', message: '这个视频还没有字幕，换一个有字幕的吧。' }
  }

  // 优先人工中文字幕，其次 AI 中文字幕，最后任意中文，最后第一个
  const pick =
    subtitles.find((s) => s.lan === 'zh-CN') ||
    subtitles.find((s) => s.lan === 'ai-zh') ||
    subtitles.find((s) => s.lan.startsWith('zh')) ||
    subtitles[0]

  let subUrl = pick.subtitle_url
  if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl

  try {
    const subResp = await fetch(subUrl)
    const subJson = await subResp.json()
    const body: { content: string }[] = subJson?.body ?? []
    const sentences = body
      .map((b) => (b.content || '').trim())
      .filter(Boolean)
    if (!sentences.length) {
      return { ok: false, reason: 'no_subtitle', message: '字幕是空的，换一个视频吧。' }
    }
    // 全文保留句子边界（换行），方便 AI 摘原文例句
    const text = sentences.join('\n')
    return { ok: true, text, sentences }
  } catch (e) {
    return { ok: false, reason: 'network', message: '下载字幕内容失败，请重试。' }
  }
}
