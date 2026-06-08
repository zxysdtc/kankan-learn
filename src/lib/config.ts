import { AppConfig, DEFAULT_CONFIG } from './types'

const KEY = 'kankan_config'

export async function getConfig(): Promise<AppConfig> {
  const data = await chrome.storage.local.get(KEY)
  const stored = (data[KEY] || {}) as Partial<AppConfig> & { deepseekApiKey?: string }
  // 兼容旧版本字段 deepseekApiKey -> apiKey
  if (!stored.apiKey && stored.deepseekApiKey) {
    stored.apiKey = stored.deepseekApiKey
  }
  return { ...DEFAULT_CONFIG, ...stored }
}

export async function saveConfig(cfg: Partial<AppConfig>): Promise<AppConfig> {
  const cur = await getConfig()
  const next = { ...cur, ...cfg }
  await chrome.storage.local.set({ [KEY]: next })
  return next
}

/**
 * 把配置里的 apiBaseUrl 规整成可直接 POST 的 chat/completions endpoint。
 * - 已是 .../chat/completions：原样使用
 * - 以 /v1 结尾或裸 base：补成 .../chat/completions
 */
export function resolveChatEndpoint(baseUrl: string): string {
  let b = (baseUrl || '').trim().replace(/\/+$/, '')
  if (!b) b = 'https://api.deepseek.com'
  if (/\/chat\/completions$/.test(b)) return b
  return b + '/chat/completions'
}
