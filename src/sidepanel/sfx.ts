// 用 WebAudio 合成音效，避免打包音频文件。
let ctx: AudioContext | null = null
function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

let volume = 1
export function setSfxVolume(v: number) {
  volume = v
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine') {
  const a = ac()
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = a.currentTime + start
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(0.25 * volume, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** 答对：上行三音 叮咚叮 */
export function playCorrect() {
  tone(523, 0, 0.18) // C5
  tone(659, 0.12, 0.18) // E5
  tone(784, 0.24, 0.3) // G5
}

/** 答错：柔和的一声「嗯」，不刺耳 */
export function playGentle() {
  tone(330, 0, 0.25, 'triangle')
}

/** 连续答对 / 完成：小烟花欢呼 */
export function playCheer() {
  ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.4))
}
