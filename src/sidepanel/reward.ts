// 金星飞散动画
export function burstStars(count = 14) {
  const layer = document.getElementById('reward-layer')
  if (!layer) return
  const emojis = ['⭐', '🌟', '✨', '🎉', '💫']
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span')
    s.className = 'star'
    s.textContent = emojis[i % emojis.length]
    s.style.left = 20 + Math.random() * 60 + '%'
    s.style.top = 30 + Math.random() * 30 + '%'
    s.style.fontSize = 18 + Math.random() * 26 + 'px'
    s.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2))
    s.style.setProperty('--dy', (-1 - Math.random()).toFixed(2))
    layer.appendChild(s)
    setTimeout(() => s.remove(), 1200)
  }
}
