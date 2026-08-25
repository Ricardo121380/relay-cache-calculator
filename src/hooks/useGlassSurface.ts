import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * 让少量重点玻璃表面获得随指针移动的镜面高光。
 * 高频坐标保存在 ref 中，并通过单个 requestAnimationFrame 批量写入 CSS 变量，
 * 不触发 React 重渲染。
 */
export function useGlassSurface<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const frame = useRef<number | null>(null)
  const point = useRef({ x: 0, y: 0 })

  const supportsInteractiveLight = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(pointer: fine)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const paint = useCallback(() => {
    frame.current = null
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.min(100, Math.max(0, ((point.current.x - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((point.current.y - rect.top) / rect.height) * 100))
    node.style.setProperty('--glass-pointer-x', `${x.toFixed(2)}%`)
    node.style.setProperty('--glass-pointer-y', `${y.toFixed(2)}%`)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (event.pointerType === 'touch' || !supportsInteractiveLight()) return
    point.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.classList.add('is-glass-active')
    if (frame.current === null) frame.current = window.requestAnimationFrame(paint)
  }, [paint, supportsInteractiveLight])

  const onPointerLeave = useCallback((event: ReactPointerEvent<T>) => {
    event.currentTarget.classList.remove('is-glass-active')
    event.currentTarget.style.removeProperty('--glass-pointer-x')
    event.currentTarget.style.removeProperty('--glass-pointer-y')
  }, [])

  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current)
  }, [])

  return { ref, onPointerMove, onPointerLeave }
}
