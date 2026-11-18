import { useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export function useAutosave(args: {
  enabled: boolean
  dirty: boolean
  signature: string
  version: number
  save: (version: number) => Promise<number>
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle')
  const accepted = useRef(args.version)
  const saving = useRef(false)
  const queued = useRef(false)
  const conflict = useRef(false)
  const serverVersion = useRef<number | null>(null)
  const saveRef = useRef(args.save)
  saveRef.current = args.save

  useEffect(() => {
    accepted.current = args.version
  }, [args.version])

  async function run() {
    if (!args.enabled || conflict.current) return
    if (saving.current) {
      queued.current = true
      return
    }
    saving.current = true
    setState('saving')
    try {
      const next = await saveRef.current(accepted.current)
      accepted.current = next
      if (queued.current) {
        queued.current = false
        saving.current = false
        await run()
        return
      }
      setState('saved')
    } catch (error) {
      queued.current = false
      if (error instanceof ApiError && error.status === 409) {
        conflict.current = true
        serverVersion.current = error.currentVersion ?? null
        setState('conflict')
      } else {
        setState('error')
      }
    } finally {
      saving.current = false
    }
  }

  useEffect(() => {
    if (!args.dirty || !args.enabled || conflict.current) return
    const timer = window.setTimeout(() => {
      void run()
    }, 700)
    return () => window.clearTimeout(timer)
    // The signature is the draft. `run` closes over the latest save function via saveRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.signature, args.dirty, args.enabled])

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!args.dirty && state !== 'saving' && state !== 'error' && state !== 'conflict') return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [args.dirty, state])

  return {
    state,
    retry() {
      if (serverVersion.current !== null) accepted.current = serverVersion.current
      conflict.current = false
      void run()
    },
    clearConflict() {
      conflict.current = false
      setState('idle')
    },
  }
}
