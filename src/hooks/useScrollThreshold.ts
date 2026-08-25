import { useEffect, useState } from 'react'

/** 只在跨过阈值时更新状态，避免滚动期间持续触发 React 渲染。 */
export function useScrollThreshold(threshold = 8) {
  const [passed, setPassed] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold)

  useEffect(() => {
    let frame: number | null = null
    const update = () => {
      frame = null
      const next = window.scrollY > threshold
      setPassed((current) => current === next ? current : next)
    }
    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [threshold])

  return passed
}
