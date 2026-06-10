// 题目渲染与答题交互。每屏一题，听觉驱动，答错温和不惩罚。
// 每题展示并朗读「原文例句」，让练习和视频内容强相关。
// 答错的题会在本轮末尾再次出现；普通模式下答错会进入错题集，复习模式据答题更新错题集。
import type { Difficulty, Question, MathArithmeticQuestion } from '../lib/types'
import { addRecord, type RecordDetail } from '../lib/records'
import { answerToSpeech } from '../lib/mathgen'
import { speak, stopSpeak, toneWord } from './tts'
import { playCorrect, playGentle, playCheer } from './sfx'
import { burstStars } from './reward'

const TONE_LABELS = ['轻声', '一声 ˉ', '二声 ˊ', '三声 ˇ', '四声 ˋ']

export type QuizMode = 'normal' | 'review'

export interface QuizCallbacks {
  /** 本轮要展示的题数（从题库里随机抽取这么多道） */
  count: number
  /** 是否自动朗读音频；false 时孩子需要点喇叭才发声 */
  autoPlay: boolean
  /** 难度档，用于做题记录 */
  difficulty: Difficulty
  /** 视频标题，用于做题记录 */
  videoTitle: string
  /** normal=普通练习；review=错题复习。默认 normal */
  mode?: QuizMode
  onFinish: () => void
  /** 某题首次答错时回调（普通模式用于加入错题集） */
  onWrong?: (q: Question) => void
  /** 某题最终答对时回调，firstTry=是否一遍答对（复习模式据此更新错题集） */
  onQuestionDone?: (q: Question, firstTry: boolean) => void
  /** 复习模式点「我学会了」回调（用于从错题集移除） */
  onLearned?: (q: Question) => void
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 队列项：replay 表示这是答错后追加到末尾的「重现题」，不计入统计与回调 */
interface QueueItem {
  q: Question
  replay: boolean
}

/**
 * @param root  挂载容器
 * @param pool  完整题库（比设置题数多若干倍；复习模式即错题题目）
 * @param cb    回调与本轮参数
 */
export function startQuiz(root: HTMLElement, pool: Question[], cb: QuizCallbacks) {
  const autoPlay = cb.autoPlay
  const mode: QuizMode = cb.mode || 'normal'

  // 从题库里乱序抽取本轮要做的题；每次重玩都重新抽，避免次序和题目重复
  function sampleRound(): QueueItem[] {
    const n = Math.max(1, Math.min(cb.count, pool.length))
    return shuffle(pool)
      .slice(0, n)
      .map((q) => ({ q, replay: false }))
  }

  let queue: QueueItem[] = sampleRound()
  let idx = 0
  let streak = 0
  let moved = false // 防止「答对自动前进」与「我学会了」重复触发 next

  // 本轮做题记录：每题是否第一次答对、总点错次数
  let details: RecordDetail[] = []
  let wrongAttempts = 0
  let wrongThis = false // 当前题是否点错过
  let requeuedThis = false // 当前题是否已追加到末尾（避免重复追加）

  function progressBar(): string {
    const dots = queue
      .map((_, i) => `<span class="dot ${i < idx ? 'done' : i === idx ? 'cur' : ''}"></span>`)
      .join('')
    return `<div class="progress">${dots}</div>`
  }

  function speakerBtn(text: string, cls = 'speaker'): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = cls
    b.innerHTML = '🔊'
    b.title = '再听一遍'
    b.onclick = () => speak(text)
    return b
  }

  /**
   * 例句卡：配一个「听句子」喇叭。
   * - 听词选词题：答案就是这个词，若例句里直接写出来就等于泄题，
   *   因此把例句中的考核词遮挡成方块（按字数显示），孩子只能靠听辨。
   * - 其它题型：考核词本来就在题面给出，例句里高亮即可。
   */
  function exampleCard(q: Question): HTMLElement {
    const card = document.createElement('div')
    card.className = 'example-card'
    const text = document.createElement('div')
    text.className = 'example-text'
    const safe = esc(q.example)
    if (q.type === 'listen_choose_word') {
      const mask = `<b class="blank">${'⬜'.repeat([...q.word].length)}</b>`
      text.innerHTML = safe.split(esc(q.word)).join(mask)
    } else {
      text.innerHTML = safe.split(esc(q.word)).join(`<b class="hl">${esc(q.word)}</b>`)
    }
    const play = speakerBtn(q.example, 'speaker mini-line')
    play.title = '听句子'
    card.appendChild(play)
    card.appendChild(text)
    return card
  }

  function renderCurrent() {
    stopSpeak()
    wrongThis = false
    requeuedThis = false
    moved = false
    const q = queue[idx].q
    root.innerHTML = ''

    const wrap = document.createElement('div')
    wrap.className = 'quiz-card'
    wrap.innerHTML = progressBar()

    const instr = document.createElement('div')
    instr.className = 'instruction'
    instr.textContent = q.instruction
    wrap.appendChild(instr)

    if (q.example) wrap.appendChild(exampleCard(q))

    // 数学题：大号展示算式「8 + 5 = ?」
    if (q.type === 'math_arithmetic') {
      const m = document.createElement('div')
      m.className = 'math-expr'
      m.innerHTML = `<span class="m-expr">${esc((q as MathArithmeticQuestion).expr)}</span><span class="m-eq">= ?</span>`
      wrap.appendChild(m)
    }

    // 大喇叭：朗读要考的词 / 算式
    wrap.appendChild(speakerBtn(q.promptAudio, 'speaker big'))

    const opts = document.createElement('div')
    opts.className = 'options'
    wrap.appendChild(opts)
    buildOptions(q, opts)

    // 复习模式：提供「我学会了」按钮，点了即从错题集移除并跳过
    if (mode === 'review') {
      const learned = document.createElement('button')
      learned.className = 'ghost-btn learned-btn'
      learned.textContent = '✅ 我学会了'
      learned.onclick = () => {
        if (moved) return
        cb.onLearned?.(q)
        stopSpeak()
        next()
      }
      wrap.appendChild(learned)
    }

    root.appendChild(wrap)

    // 进入题目自动朗读：引导语 →（有例句先读例句）→ 考核词
    // 手动模式下不自动朗读，孩子需要点喇叭才发声
    if (autoPlay) {
      setTimeout(async () => {
        await speak(q.instruction)
        if (q.example) await speak(q.example)
        await speak(q.promptAudio)
      }, 200)
    }
  }

  function lock(opts: HTMLElement, locked: boolean) {
    opts.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = locked))
  }

  function onCorrect(btn: HTMLElement, opts: HTMLElement, sayText: string) {
    btn.classList.add('correct')
    lock(opts, true)
    const item = queue[idx]
    // 仅对「原题」计分与回调；末尾重现的 replay 题只作巩固，不重复计数
    if (!item.replay) {
      details.push({ word: item.q.word, type: item.q.type, firstTry: !wrongThis })
      cb.onQuestionDone?.(item.q, !wrongThis)
    }
    streak++
    playCorrect()
    burstStars()
    const praise = streak >= 3 ? '太棒啦，你真聪明！' : '答对了，真棒！'
    if (streak >= 3) playCheer()
    speak(sayText).then(() => speak(praise))
    setTimeout(next, 1700)
  }

  function onWrong(btn: HTMLElement, q: Question) {
    streak = 0
    wrongAttempts++
    const item = queue[idx]
    // 答错的题在本轮末尾再次出现一次（同一题只追加一次）
    if (!item.replay && !requeuedThis) {
      queue.push({ q: item.q, replay: true })
      requeuedThis = true
    }
    // 每题首次答错：触发回调（普通模式 → 加入错题集）
    if (!wrongThis) {
      wrongThis = true
      cb.onWrong?.(q)
    }
    btn.classList.add('wrong-shake')
    playGentle()
    speak('再试一次哦').then(() => speak(q.promptAudio))
    setTimeout(() => btn.classList.remove('wrong-shake'), 600)
  }

  function buildOptions(q: Question, opts: HTMLElement) {
    if (q.type === 'math_arithmetic') {
      const mq = q as MathArithmeticQuestion
      mq.options.forEach((num, i) => {
        const b = document.createElement('button')
        b.className = 'opt mathopt'
        const span = document.createElement('span')
        span.textContent = String(num)
        b.appendChild(span)
        b.onclick = () => {
          if (i === mq.answer) onCorrect(b, opts, answerToSpeech(mq.expr, num))
          else onWrong(b, q)
        }
        opts.appendChild(b)
      })
      return
    }

    if (q.type === 'tone_select') {
      for (let t = 1; t <= 4; t++) {
        const b = document.createElement('button')
        b.className = 'opt tone'
        b.innerHTML = `<span class="num">${t}</span><span class="mark">${TONE_LABELS[t]}</span>`
        b.onclick = () => {
          if (t === q.answer) onCorrect(b, opts, `${q.word}，${toneWord(q.answer)}`)
          else onWrong(b, q)
        }
        opts.appendChild(b)
      }
      return
    }

    const options = (q as any).options as string[]
    const answer = (q as any).answer as number
    const isWord = q.type === 'listen_choose_word'
    options.forEach((text, i) => {
      const b = document.createElement('button')
      b.className = 'opt ' + (isWord ? 'wordopt' : 'pinyin-opt')
      const span = document.createElement('span')
      span.textContent = text
      b.appendChild(span)
      // 词语选项可单独点喇叭听
      if (isWord) {
        const mini = document.createElement('span')
        mini.className = 'mini-speaker'
        mini.textContent = '🔊'
        mini.onclick = (ev) => {
          ev.stopPropagation()
          speak(text)
        }
        b.appendChild(mini)
      }
      b.onclick = () => {
        if (i === answer) {
          const say =
            q.type === 'choose_pinyin' || q.type === 'initial_select'
              ? `${q.word}，${q.pinyin}`
              : text
          onCorrect(b, opts, say)
        } else onWrong(b, q)
      }
      opts.appendChild(b)
    })
  }

  function next() {
    if (moved) return
    moved = true
    idx++
    if (idx >= queue.length) finish()
    else renderCurrent()
  }

  function finish() {
    stopSpeak()
    const correct = details.filter((d) => d.firstTry).length
    const total = details.length

    // 仅普通练习记录做题历史；复习模式不计入历史
    if (mode === 'normal') {
      addRecord({
        time: Date.now(),
        videoTitle: cb.videoTitle,
        difficulty: cb.difficulty,
        total,
        correct,
        wrongAttempts,
        details
      }).catch(() => {})
    }

    if (mode === 'review') {
      root.innerHTML = `
        <div class="finish">
          <div class="big-emoji">📕</div>
          <div class="finish-title">错题复习完成！</div>
          <div class="finish-score">这次复习了 ${total} 道题，继续加油～</div>
          <button id="back" class="primary-btn">回到首页</button>
        </div>`
    } else {
      root.innerHTML = `
        <div class="finish">
          <div class="big-emoji">🏆</div>
          <div class="finish-title">全部完成啦！</div>
          <div class="finish-score">这次一遍就答对 ${correct} / ${total} 题</div>
          <button id="again" class="primary-btn">再玩一次</button>
          <button id="back" class="ghost-btn">回到首页</button>
        </div>`
    }

    playCheer()
    burstStars(24)
    speak(mode === 'review' ? '错题复习完成，真棒！' : '全部完成啦，你真厉害！')

    const again = root.querySelector('#again') as HTMLButtonElement | null
    if (again) {
      again.onclick = () => {
        // 重玩：重新随机抽题、清空本轮统计
        queue = sampleRound()
        idx = 0
        streak = 0
        details = []
        wrongAttempts = 0
        wrongThis = false
        requeuedThis = false
        moved = false
        renderCurrent()
      }
    }
    ;(root.querySelector('#back') as HTMLButtonElement).onclick = () => cb.onFinish()
  }

  function esc(s: string): string {
    return s.replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)
    )
  }

  renderCurrent()
}
