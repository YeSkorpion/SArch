import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from './api'
import type { Together } from './types'

export function presenceArtifact(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'projekte') return null
  const segment = parts[2]
  const third = parts[3]
  const fourth = parts[4]
  const guid = (value?: string) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value))
  if (segment === 'system' && third === 'komponenten' && guid(fourth)) return fourth ?? null
  if (segment && ['diagramme', 'anforderungen', 'ui', 'dokumente', 'aenderungen'].includes(segment) && guid(third)) return third ?? null
  return null
}

export function useTogether(projectId: string | undefined, label: string, artifactId: string | null) {
  const client = useQueryClient()
  const seen = useRef<number | null>(null)
  const together = useQuery({
    queryKey: ['together', projectId, label, artifactId],
    queryFn: () => api<Together>(`/api/v1/projects/${projectId}/presence`, { method: 'POST', body: { label, artifactId } }),
    enabled: Boolean(projectId),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    seen.current = null
  }, [projectId])
  useEffect(() => {
    const revision = together.data?.revision
    if (!projectId || revision === undefined) return
    if (seen.current === null) {
      seen.current = revision
      return
    }
    if (seen.current === revision) return
    seen.current = revision
    void client.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'together' && query.queryKey.includes(projectId),
    })
  }, [client, projectId, together.data?.revision])
  return together.data?.people ?? []
}
