// 全局共享类型定义

/** 题型。考核点统一为「word」（可能是高频词，也可能是单字，数学题则为算式） */
export type QuestionType =
  | 'listen_choose_word' // 听词选词：放词的读音，从几个词里选对的
  | 'choose_pinyin' // 选出这个词/字的正确拼音
  | 'tone_select' // 声调选择（仅单字）：这个字是第几声
  | 'initial_select' // 选声母（仅单字）
  | 'math_arithmetic' // 数学加减：算一算得数是几，从几个数里选对的

export interface BaseQuestion {
  type: QuestionType
  /** 考核点：来自视频的高频词或关键字（1~4字） */
  word: string
  /** word 的带声调拼音，如「小猪」-> xiǎo zhū */
  pinyin: string
  /** 原文例句：从字幕里摘出的、含有该词的一句话（可能为空） */
  example: string
  /** 简短的语音引导语，告诉孩子要做什么 */
  instruction: string
  /** 进入题目时自动朗读的考核内容（一般等于 word） */
  promptAudio: string
}

export interface ListenChooseWordQuestion extends BaseQuestion {
  type: 'listen_choose_word'
  options: string[] // 词语选项
  answer: number // 正确选项下标
}

export interface ChoosePinyinQuestion extends BaseQuestion {
  type: 'choose_pinyin'
  options: string[] // 拼音选项
  answer: number
}

export interface ToneSelectQuestion extends BaseQuestion {
  type: 'tone_select'
  answer: number // 1-4，轻声记为 0
}

export interface InitialSelectQuestion extends BaseQuestion {
  type: 'initial_select'
  options: string[] // 声母选项，如 zh / sh / s / z
  answer: number
}

/**
 * 数学加减题：
 * - `word` 复用为算式去空格形式（如「8+5」），用作错题集去重键与展示；
 * - `expr` 是带空格的算式（如「8 + 5」），用于大号展示；
 * - `example` 可选，AI 增强时填一句应用题情境；
 * - `options` 是候选得数（数字），`answer` 为正确选项下标。
 */
export interface MathArithmeticQuestion extends BaseQuestion {
  type: 'math_arithmetic'
  expr: string // 带空格算式，如「13 - 5」
  options: number[] // 候选得数
  answer: number // 正确选项下标
}

export type Question =
  | ListenChooseWordQuestion
  | ChoosePinyinQuestion
  | ToneSelectQuestion
  | InitialSelectQuestion
  | MathArithmeticQuestion

/** 当前视频信息（content -> background） */
export interface VideoInfo {
  bvid: string
  cid: number
  title: string
  tabId?: number
}

/** 字幕拉取结果 */
export interface SubtitleResult {
  ok: boolean
  /** 字幕全文（句子用换行拼接，供 AI 阅读） */
  text?: string
  /** 逐条字幕原句（保留句子边界，供提取例句 / 词频统计） */
  sentences?: string[]
  title?: string
  /** 失败原因码 */
  reason?: 'need_login' | 'no_subtitle' | 'network' | 'no_video'
  message?: string
}

/** 出题结果 */
export interface QuizResult {
  ok: boolean
  questions?: Question[]
  /** 是否使用了离线兜底出题 */
  fallback?: boolean
  message?: string
}

/** 难度档：1 简单 / 2 中等 / 3 挑战 */
export type Difficulty = 1 | 2 | 3

/** 扩展配置 */
export interface AppConfig {
  /** OpenAI 兼容接口的 API Key */
  apiKey: string
  /** OpenAI 兼容接口地址：可填 base（如 https://api.deepseek.com）或完整 endpoint */
  apiBaseUrl: string
  /** 模型名，如 deepseek-chat / gpt-4o-mini */
  apiModel: string
  questionCount: number // 每个视频出几题
  difficulty: Difficulty // 难度档
  volume: number // 0-1
  rate: number // 语速 0.5-1.5
  /** 进入题目时是否自动朗读音频；false 时只在点击喇叭后播放 */
  autoPlayAudio: boolean
  /** 复习时是否「连续答对自动移除错题」；false 时只能手动「我学会了」移除 */
  wrongbookAutoRemove: boolean
  /** 连续答对几轮自动移出错题集（autoRemove 为 true 时生效） */
  wrongbookMasterStreak: number
  /** 数学：数值上限（20 = 20以内加减，100 = 100以内） */
  mathMaxNumber: number
  /** 数学：运算类型 add 只加 / sub 只减 / both 加减混合 */
  mathOps: 'add' | 'sub' | 'both'
  /** 数学：是否优先出含进位/退位的题（更有挑战） */
  mathCarry: boolean
  /** 数学：是否调用 AI 给算式配一句应用题情境（需填 API 密钥；得数仍由本地计算保证正确） */
  mathUseAi: boolean
  /** 首页「打开B站」跳转地址：留空则跳 B站首页；可填某个 UP 主主页，点击直达该主页 */
  biliJumpUrl: string
}

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  apiBaseUrl: 'https://api.deepseek.com',
  apiModel: 'deepseek-chat',
  questionCount: 4,
  difficulty: 1,
  volume: 1,
  rate: 0.8,
  autoPlayAudio: true,
  wrongbookAutoRemove: true,
  wrongbookMasterStreak: 2,
  mathMaxNumber: 20,
  mathOps: 'both',
  mathCarry: true,
  mathUseAi: false,
  biliJumpUrl: ''
}

/** 消息协议 */
export type Msg =
  | { type: 'VIDEO_DETECTED'; video: { bvid: string; cid: number; title: string } }
  | { type: 'VIDEO_ENDED' }
  | { type: 'GET_STATE' }
  | { type: 'FETCH_SUBTITLE' }
  | { type: 'START_QUIZ' }
  | { type: 'MATH_QUIZ' }
  | { type: 'SUBTITLE_RESULT'; result: SubtitleResult }
  | { type: 'QUIZ_RESULT'; result: QuizResult }
  | { type: 'STATE_UPDATE'; state: PanelState }

/** 侧边栏可见状态 */
export interface PanelState {
  phase: 'idle' | 'subtitle_loading' | 'ready' | 'video_ended' | 'quiz_loading' | 'error'
  videoTitle?: string
  subtitleReady: boolean
  error?: string
}
