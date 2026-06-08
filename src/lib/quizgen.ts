// 离线兜底出题 + DeepSeek 题目规范化。
// 考核点 = 视频里反复出现的高频词 / 关键字，每题尽量配一句原文例句。
import type {
  Question,
  ListenChooseWordQuestion,
  ChoosePinyinQuestion,
  ToneSelectQuestion,
  InitialSelectQuestion,
  Difficulty
} from './types'
import {
  toPinyin,
  toneOf,
  initialOf,
  isHanzi,
  ALL_INITIALS,
  CONFUSABLE_INITIALS,
  nearSoundVariants
} from './pinyin'
import { pickWordDistractors } from './commonChars'
import { topWords, topChars, findExample } from './wordfreq'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- 单题构造（答案一律用 pinyin-pro 校准） ----------

function makeListenChooseWord(
  word: string,
  example: string,
  otherWords: string[]
): ListenChooseWordQuestion {
  const pool = otherWords.filter((w) => w !== word)
  let distractors = shuffle(pool).slice(0, 3)
  if (distractors.length < 3) {
    distractors = distractors.concat(
      pickWordDistractors([word, ...distractors], 3 - distractors.length)
    )
  }
  const options = shuffle([word, ...distractors])
  return {
    type: 'listen_choose_word',
    word,
    pinyin: toPinyin(word),
    example,
    promptAudio: word,
    instruction: `听一听，哪个是「${toPinyin(word)}」？`,
    options,
    answer: options.indexOf(word)
  }
}

function makeChoosePinyin(
  word: string,
  example: string,
  difficulty: Difficulty = 1
): ChoosePinyinQuestion {
  const correct = toPinyin(word)
  const variants = new Set<string>()
  if (difficulty >= 3) {
    // 挑战：近音干扰（平翘舌/前后鼻音/声调），更难听辨
    for (const v of shuffle(nearSoundVariants(correct))) {
      variants.add(v)
      if (variants.size >= 3) break
    }
  }
  // 不够再用其它常用词的拼音补足（简单/中等以此为主）
  if (variants.size < 3) {
    for (const w of pickWordDistractors([word], 8)) {
      const p = toPinyin(w)
      if (p && p !== correct) variants.add(p)
      if (variants.size >= 3) break
    }
  }
  const options = shuffle([correct, ...Array.from(variants).slice(0, 3)])
  return {
    type: 'choose_pinyin',
    word,
    pinyin: correct,
    example,
    promptAudio: word,
    instruction: `「${word}」的拼音是哪个？`,
    options,
    answer: options.indexOf(correct)
  }
}

function makeToneSelect(char: string, example: string): ToneSelectQuestion {
  return {
    type: 'tone_select',
    word: char,
    pinyin: toPinyin(char),
    example,
    promptAudio: char,
    instruction: `「${char}」是第几声？听一听再选。`,
    answer: toneOf(char)
  }
}

function makeInitialSelect(
  char: string,
  example: string,
  difficulty: Difficulty = 1
): InitialSelectQuestion {
  const correct = initialOf(char)
  if (!correct) return makeToneSelect(char, example) as unknown as InitialSelectQuestion
  let distractors: string[]
  if (difficulty >= 3 && CONFUSABLE_INITIALS[correct]) {
    // 挑战：用易混声母（平翘舌、鼻边音）当干扰
    distractors = CONFUSABLE_INITIALS[correct].slice(0, 3)
  } else {
    distractors = shuffle(ALL_INITIALS.filter((i) => i !== correct)).slice(0, 3)
  }
  const options = shuffle([correct, ...distractors])
  return {
    type: 'initial_select',
    word: char,
    pinyin: toPinyin(char),
    example,
    promptAudio: char,
    instruction: `「${char}」的声母是哪个？`,
    options,
    answer: options.indexOf(correct)
  }
}

// ---------- 离线兜底：基于词频出题 ----------

/**
 * 规则兜底出题：统计视频高频词，按难度调整题型分布与干扰项。
 * - 简单：以「听词选词」为主（听+认，最友好）。
 * - 中等：听词选词 / 选拼音 混合。
 * - 挑战：以「选拼音 / 声母」为主，干扰项用近音、易混声母。
 * 每题尽量配原文例句。
 */
export function generateFallbackQuiz(
  sentences: string[],
  count: number,
  difficulty: Difficulty = 1
): Question[] {
  const words = topWords(sentences, Math.max(count, 4)) // 高频多字词
  const chars = topChars(sentences, Math.max(count, 4)) // 高频实词单字
  const out: Question[] = []

  // 词类题：根据难度决定「听词选词」与「选拼音」的比例
  // 简单→几乎都是听词选词；中等→各半；挑战→偏选拼音
  const pinyinRatio = difficulty === 1 ? 0.25 : difficulty === 2 ? 0.5 : 0.8
  words.forEach((w, i) => {
    if (out.length >= count) return
    const ex = findExample(w, sentences)
    const usePinyin = (i + 1) / words.length <= pinyinRatio
    out.push(usePinyin ? makeChoosePinyin(w, ex, difficulty) : makeListenChooseWord(w, ex, words))
  })

  // 不够再用高频单字出「声调 / 声母」（挑战难度偏向声母辨析）
  for (let i = 0; out.length < count && i < chars.length; i++) {
    const c = chars[i]
    if (words.some((w) => w.includes(c))) continue
    const ex = findExample(c, sentences)
    const useInitial = difficulty >= 3 ? true : i % 2 === 1
    out.push(useInitial ? makeInitialSelect(c, ex, difficulty) : makeToneSelect(c, ex))
  }

  return out.slice(0, count)
}

// ---------- DeepSeek 返回结果规范化 ----------

/**
 * 校验/补全 DeepSeek 返回的题目：
 * - 拼音、声调、声母一律以 pinyin-pro 重算，保证答案正确；
 * - example 缺失或不含 word 时，从原文 sentences 兜底补一句。
 */
export function normalizeQuestions(
  raw: any,
  sentences: string[],
  difficulty: Difficulty = 1
): Question[] {
  const list: any[] = Array.isArray(raw?.questions) ? raw.questions : []
  const allWords = list.map((q) => String(q?.word || '')).filter(Boolean)
  const out: Question[] = []

  for (const q of list) {
    const word = String(q.word || '').trim()
    if (!word || ![...word].every(isHanzi)) continue

    // 例句：优先用 AI 给的（须含 word 且来自较短句子），否则原文兜底
    let example = String(q.example || '').trim()
    if (!example || !example.includes(word)) {
      example = findExample(word, sentences)
    }

    switch (q.type) {
      case 'listen_choose_word': {
        const options: string[] = Array.isArray(q.options) ? q.options.map(String) : []
        if (options.length >= 2 && options.includes(word)) {
          out.push({
            type: 'listen_choose_word',
            word,
            pinyin: toPinyin(word),
            example,
            promptAudio: word,
            instruction: q.instruction || `听一听，哪个是「${toPinyin(word)}」？`,
            options,
            answer: options.indexOf(word)
          })
        } else {
          out.push(makeListenChooseWord(word, example, allWords))
        }
        break
      }
      case 'choose_pinyin': {
        const correct = toPinyin(word)
        const options: string[] = Array.isArray(q.options) ? q.options.map(String) : []
        if (options.length >= 2 && options.includes(correct)) {
          out.push({
            type: 'choose_pinyin',
            word,
            pinyin: correct,
            example,
            promptAudio: word,
            instruction: q.instruction || `「${word}」的拼音是哪个？`,
            options,
            answer: options.indexOf(correct)
          })
        } else {
          out.push(makeChoosePinyin(word, example, difficulty))
        }
        break
      }
      case 'tone_select':
        out.push(makeToneSelect([...word][0], example))
        break
      case 'initial_select':
        out.push(makeInitialSelect([...word][0], example, difficulty))
        break
      default:
        out.push(makeListenChooseWord(word, example, allWords))
    }
  }
  return out
}
