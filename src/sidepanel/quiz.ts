// 题目渲染与答题交互。每屏一题，听觉驱动，答错温和不惩罚。
// 每题展示并朗读「原文例句」，让练习和视频内容强相关。
import type { Question } from '../lib/types'
import { speak, stopSpeak, toneWord } from './tts'
import { playCorrect, playGentle, playCheer } from './sfx'
import { burstStars } from './reward'

const TONE_LABELS = ['轻声', '一声 ˉ', '二声 ˊ', '三声 ˇ', '四声 ˋ']

export interface QuizCallbacks {
  onFinish: () => void
}

export function startQuiz(root: HTMLElement, questions: Question[], cb: QuizCallbacks) {
  let idx = 0
  let streak = 0

  function progressBar(): string {
    const dots = questions
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

  /** 例句卡：把考核词高亮，配一个「听句子」喇叭 */
  function exampleCard(q: Question): HTMLElement {
    const card = document.createElement('div')
    card.className = 'example-card'
    const text = document.createElement('div')
    text.className = 'example-text'
    const safe = esc(q.example)
    text.innerHTML = safe.split(esc(q.word)).join(`<b class="hl">${esc(q.word)}</b>`)
    const play = speakerBtn(q.example, 'speaker mini-line')
    play.title = '听句子'
    card.appendChild(play)
    card.appendChild(text)
    return card
  }

  function renderCurrent() {
    stopSpeak()
    const q = questions[idx]
    root.innerHTML = ''

    const wrap = document.createElement('div')
    wrap.className = 'quiz-card'
    wrap.innerHTML = progressBar()

    const instr = document.createElement('div')
    instr.className = 'instruction'
    instr.textContent = q.instruction
    wrap.appendChild(instr)

    if (q.example) wrap.appendChild(exampleCard(q))

    // 大喇叭：朗读要考的词
    wrap.appendChild(speakerBtn(q.promptAudio, 'speaker big'))

    const opts = document.createElement('div')
    opts.className = 'options'
    wrap.appendChild(opts)
    buildOptions(q, opts)

    root.appendChild(wrap)

    // 进入题目自动朗读：引导语 →（有例句先读例句）→ 考核词
    setTimeout(async () => {
      await speak(q.instruction)
      if (q.example) await speak(q.example)
      await speak(q.promptAudio)
    }, 200)
  }

  function lock(opts: HTMLElement, locked: boolean) {
    opts.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = locked))
  }

  function onCorrect(btn: HTMLElement, opts: HTMLElement, sayText: string) {
    btn.classList.add('correct')
    lock(opts, true)
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
    btn.classList.add('wrong-shake')
    playGentle()
    speak('再试一次哦').then(() => speak(q.promptAudio))
    setTimeout(() => btn.classList.remove('wrong-shake'), 600)
  }

  function buildOptions(q: Question, opts: HTMLElement) {
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
    idx++
    if (idx >= questions.length) finish()
    else renderCurrent()
  }

  function finish() {
    stopSpeak()
    root.innerHTML = `
      <div class="finish">
        <div class="big-emoji">🏆</div>
        <div class="finish-title">全部完成啦！</div>
        <button id="again" class="primary-btn">再玩一次</button>
        <button id="back" class="ghost-btn">回到首页</button>
      </div>`
    playCheer()
    burstStars(24)
    speak('全部完成啦，你真厉害！')
    ;(root.querySelector('#again') as HTMLButtonElement).onclick = () => {
      idx = 0
      streak = 0
      renderCurrent()
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
