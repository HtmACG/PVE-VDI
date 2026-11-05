import type { Router } from 'vitepress'

/**
 * 轻量灯箱：点击 figure.shot 内的截图全屏放大，点击遮罩或按 Esc 关闭。
 * 使用事件委托，页面切换后无需重新绑定。
 */
export function setupLightbox(_router: Router) {
  const overlay = document.createElement('div')
  overlay.className = 'lightbox'
  overlay.innerHTML = '<img alt="">'
  const img = overlay.querySelector('img')!

  const close = () => {
    overlay.classList.remove('show')
    document.body.classList.remove('lightbox-lock')
  }

  overlay.addEventListener('click', close)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG' && target.closest('figure.shot')) {
      img.src = target.getAttribute('src') || ''
      img.alt = target.getAttribute('alt') || ''
      if (!document.body.contains(overlay)) document.body.appendChild(overlay)
      requestAnimationFrame(() => overlay.classList.add('show'))
      document.body.classList.add('lightbox-lock')
    }
  })
}
