import { useEffect } from 'react'

export function useRememberScroll(key: string) {
  useEffect(() => {
    const raw = sessionStorage.getItem(`studio-scroll:${key}`)
    if (raw) {
      const y = Number(raw)
      if (Number.isFinite(y)) requestAnimationFrame(() => window.scrollTo(0, y))
    }
    return () => sessionStorage.setItem(`studio-scroll:${key}`, String(window.scrollY))
  }, [key])
}

export function motionMs(ms: number) {
  if (typeof window === 'undefined') return ms
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms
}

export function rememberFlag(key: string, value: boolean) {
  localStorage.setItem(key, value ? '1' : '0')
}

export function readFlag(key: string, fallback = true) {
  const stored = localStorage.getItem(key)
  if (stored === null) return fallback
  return stored !== '0'
}
