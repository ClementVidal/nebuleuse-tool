import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

const EDGE = 28 // px from the left screen edge where the gesture must start
const DISTANCE = 70 // px of horizontal travel to trigger

/**
 * Swipe from the left edge of the screen towards the right to go back to the previous
 * position (previous map and its view), like the system back gesture on phones.
 */
export function useSwipeBack() {
  const router = useRouter()

  useEffect(() => {
    let start: { x: number; y: number } | undefined

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      start = event.touches.length === 1 && touch.clientX <= EDGE ? { x: touch.clientX, y: touch.clientY } : undefined
      // Keep the canvas from panning while the gesture is ours.
      if (start) event.stopPropagation()
    }
    const onTouchMove = (event: TouchEvent) => {
      if (!start) return
      event.stopPropagation()
      const touch = event.touches[0]
      const dx = touch.clientX - start.x
      const dy = Math.abs(touch.clientY - start.y)
      if (dy > Math.max(40, dx)) {
        start = undefined // mostly vertical: not a back gesture
      } else if (dx > DISTANCE) {
        start = undefined
        if (router.history.canGoBack()) router.history.back()
      }
    }
    const onTouchEnd = () => {
      start = undefined
    }

    const options = { capture: true, passive: true }
    window.addEventListener('touchstart', onTouchStart, options)
    window.addEventListener('touchmove', onTouchMove, options)
    window.addEventListener('touchend', onTouchEnd, options)
    return () => {
      window.removeEventListener('touchstart', onTouchStart, options)
      window.removeEventListener('touchmove', onTouchMove, options)
      window.removeEventListener('touchend', onTouchEnd, options)
    }
  }, [router])
}
