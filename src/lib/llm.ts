// 通用 LLM 出题客户端：兼容 OpenAI 格式接口（DeepSeek / OpenAI / 自建均可）。
// 端点、模型、Key、难度、题量全部来自配置。只在 background service worker 中调用。
import type { AppConfig, Question, QuizResult, Difficulty } from './types'
import { resolveChatEndpoint } from './config'
import { normalizeQuestions, generateFallbackQuiz } from './quizgen'

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  1: '难度：简单。多用「听词选词」，选词语 2 个字为主，干扰项和正确答案差别明显，便于入门。',
  2: '难度：中等。「听词选词」和「选拼音」各占一半，词语可 2~3 个字，干扰项有一定迷惑性。',
  3: '难度：挑战。多用「选拼音」「选声母」，词语可 3 个字，拼音干扰项要做成近音（平翘舌、前后鼻音、声调相近），需要仔细听辨。'
}

function buildPrompt(subtitle: string, count: number, difficulty: Difficulty): string {
  const clipped = subtitle.slice(0, 3000)
  return `你是一位小学低年级语文老师，正在给一个上四年级、但识字和拼音都还比较弱的小朋友出练习题。她刚看完一个视频，下面是这个视频的字幕（每行是一句话）：
"""
${clipped}
"""

请你**先通读字幕，找出这个视频里反复出现的、最能代表视频内容的高频词语或关键概念**（优先 2~3 个字的词，而不是随便的生字），共选 ${count} 个，每个出 1 道题。务必让题目和视频内容强相关。

${DIFFICULTY_DESC[difficulty]}

每道题要求：
- "word"：考核的词语或字（必须是在字幕里真实出现过的、有意义的词）。
- "example"：**从上面字幕里原样摘抄一句包含这个词的话**（不要自己编，要用原文）。
- "type" 从下面选（按上面的难度要求把握比例）：
  - "listen_choose_word"：听词语读音，从几个词里选对的。需要 "options"（3~4 个词，含正确词，干扰词最好也来自这个视频）。
  - "choose_pinyin"：选出这个词的正确拼音。需要 "options"（3~4 个带声调拼音，含正确的）。
  - "tone_select"：判断某个**单字**是第几声（此时 word 填单个字）。
  - "initial_select"：选出某个**单字**的声母（此时 word 填单个字）。需要 "options"（3~4 个声母）。
- "instruction"：给孩子的一句话引导语，简短、亲切、鼓励。

只输出 JSON，不要任何多余文字，格式：
{
  "questions": [
    {
      "type": "listen_choose_word",
      "word": "恐龙",
      "example": "很久很久以前，地球上生活着很多恐龙。",
      "instruction": "听一听，哪个词是 kǒng lóng？",
      "options": ["恐龙", "老虎", "大象", "兔子"]
    }
  ]
}`
}

export async function generateQuiz(
  cfg: AppConfig,
  subtitleText: string,
  sentences: string[]
): Promise<QuizResult> {
  const count = cfg.questionCount
  const difficulty = cfg.difficulty

  // 无 Key 直接走兜底
  if (!cfg.apiKey) {
    const questions = generateFallbackQuiz(sentences, count, difficulty)
    return finalize(questions, true, '没有填写 API 密钥，用了简单题。')
  }

  try {
    const resp = await fetch(resolveChatEndpoint(cfg.apiBaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.apiModel || 'deepseek-chat',
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你只输出合法 JSON。' },
          { role: 'user', content: buildPrompt(subtitleText, count, difficulty) }
        ]
      })
    })

    if (!resp.ok) {
      const questions = generateFallbackQuiz(sentences, count, difficulty)
      return finalize(questions, true, `AI出题失败(${resp.status})，先用简单题。`)
    }

    const json = await resp.json()
    const content: string = json?.choices?.[0]?.message?.content ?? ''
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      const m = content.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : null
    }

    const questions = normalizeQuestions(parsed, sentences, difficulty)
    if (!questions.length) {
      const fb = generateFallbackQuiz(sentences, count, difficulty)
      return finalize(fb, true, 'AI没出好题，先用简单题。')
    }
    return finalize(questions.slice(0, count), false)
  } catch (e) {
    const questions = generateFallbackQuiz(sentences, count, difficulty)
    return finalize(questions, true, '连不上AI，先用简单题。')
  }
}

function finalize(questions: Question[], fallback: boolean, message?: string): QuizResult {
  if (!questions.length) {
    return { ok: false, message: '这段字幕里没找到适合出题的词。' }
  }
  return { ok: true, questions, fallback, message }
}
