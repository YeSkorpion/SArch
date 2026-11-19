import { Node, mergeAttributes } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type ReactNodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bold, ChevronDown, ChevronRight, Code, FileText, Heading1, Heading2, Heading3, Italic, Link2, List, ListChecks, ListOrdered, Minus, Quote, Scale, Search, Strikethrough, Table as TableIcon, Underline } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useOutletContext, useParams } from 'react-router'
import { LeaveGuard } from '../../components/LeaveGuard'
import { ConflictBanner, EmptyState, ErrorState, Loading, SaveBadge } from '../../components/states'
import { Badge, Button, Field, Input, Menu, MenuItem, Modal, Select } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { useAutosave } from '../../lib/autosave'
import { artifactHref, createsCycle, documentStatusLabel } from '../../lib/labels'
import type { Document, DocumentKind, DocumentListItem, DocumentStatus, Revision, SearchHit } from '../../lib/types'
import { LinkPanel } from '../links/LinkPanel'
import { SourcesPanel } from '../plan/SourcesPanel'
import { UsagePanel } from '../usage/UsagePanel'
import { ImpactList } from '../requirements/RequirementsPages'
import type { ProjectOutlet } from '../shell/Shell'
import type { Impact } from '../../lib/types'

const deletedIds = new Set<string>()

const ArtifactLink = Node.create({
  name: 'artifactLink',
  inline: true,
  group: 'inline',
  atom: true,
  addAttributes() {
    return {
      artifactId: { default: '' },
      label: { default: 'Artefakt' },
      artifactType: { default: '' },
      diagramId: { default: null },
    }
  },
  parseHTML: () => [{ tag: 'span[data-artifact-id]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes({ 'data-artifact-id': HTMLAttributes.artifactId }, HTMLAttributes), HTMLAttributes.label as string],
  addNodeView() {
    return ReactNodeViewRenderer(ArtifactView)
  },
})

function ArtifactView({ node }: ReactNodeViewProps) {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const deleted = deletedIds.has(String(node.attrs.artifactId))
  const label = String(node.attrs.label)
  const type = String(node.attrs.artifactType ?? '')
  const href = type
    ? artifactHref(projectId, type, String(node.attrs.artifactId), node.attrs.diagramId ? String(node.attrs.diagramId) : null)
    : ''
  return (
    <NodeViewWrapper as="span" className="rounded bg-background px-1">
      {deleted || !href ? (
        <span className="underline">
          {label}
          {deleted ? ' (Gelöschtes Artefakt)' : ''}
        </span>
      ) : (
        <a
          className="underline"
          href={href}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void navigate(href)
          }}
        >
          {label}
        </a>
      )}
    </NodeViewWrapper>
  )
}

export function DocumentsPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const documents = useQuery({ queryKey: ['documents', project.id], queryFn: () => api<DocumentListItem[]>(`/api/v1/projects/${project.id}/documents`) })
  if (documents.isLoading) return <Loading />
  if (documents.isError) return <div className="p-6"><ErrorState error={documents.error} onRetry={() => void documents.refetch()} /></div>
  const entry = entryPage(documents.data ?? [])
  if (entry) return <Navigate to={`/projekte/${project.id}/dokumente/${entry.id}`} replace />
  const roots = (documents.data ?? []).filter((item) => !item.parentId)
  return (
    <DocFrame projectId={project.id} canWrite={canWrite} activeId={null} items={documents.data ?? []}>
      <div className="w-full px-4 py-6 md:px-8">
        {roots.length === 0 ? (
          <EmptyState title="Noch keine Seiten" body="Lege eine Seite oder eine Architekturentscheidung an." />
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Dokumentation</h1>
            <p className="mt-1 text-sm text-muted">Oberste Ebene. Wähle eine Seite, um sie zu lesen.</p>
            <ul className="mt-4 divide-y divide-line">
              {roots.map((item) => (
                <li key={item.id}>
                  <Link className="block py-2.5 font-medium" to={`/projekte/${project.id}/dokumente/${item.id}`}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </DocFrame>
  )
}

function entryPage(items: DocumentListItem[]) {
  const roots = items.filter((item) => !item.parentId)
  return roots.find((item) => /überblick|ueberblick|startseite|index/i.test(item.title)) ?? (roots.length === 1 ? roots[0] : null)
}

function DocFrame({ projectId, canWrite, activeId, items, children }: { projectId: string; canWrite: boolean; activeId: string | null; items?: DocumentListItem[]; children: ReactNode }) {
  const documents = useQuery({ queryKey: ['documents', projectId], queryFn: () => api<DocumentListItem[]>(`/api/v1/projects/${projectId}/documents`) })
  const list = items ?? documents.data ?? []
  const reader = useRef<HTMLDivElement>(null)
  const [drawer, setDrawer] = useState(false)
  const drawerButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    reader.current?.scrollTo(0, 0)
  }, [activeId])
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[280px] shrink-0 flex-col overflow-hidden border-r border-line bg-nav lg:flex" aria-label="Seitenstruktur">
        <DocTree projectId={projectId} canWrite={canWrite} items={list} activeId={activeId} onOpen={() => setDrawer(false)} />
      </aside>
      <div ref={reader} className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-nav px-3 py-2 lg:hidden">
          <button ref={drawerButton} className="inline-flex h-8 items-center rounded-md border border-line bg-card px-2 text-sm font-medium" type="button" onClick={() => setDrawer(true)}>Seitenstruktur</button>
        </div>
        {children}
      </div>
      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="studio-overlay absolute inset-0 bg-black/40" type="button" aria-label="Seitenstruktur ausblenden" onClick={() => { setDrawer(false); drawerButton.current?.focus() }} />
          <aside className="studio-drawer absolute inset-y-0 left-0 flex w-[min(20rem,100%)] flex-col bg-nav shadow-overlay" aria-label="Seitenstruktur">
            <div className="flex items-center justify-between px-3 pt-3">
              <p className="text-sm font-semibold">Seitenstruktur</p>
              <button className="rounded-md px-2 py-1 text-sm" type="button" onClick={() => { setDrawer(false); drawerButton.current?.focus() }}>Schließen</button>
            </div>
            <DocTree projectId={projectId} canWrite={canWrite} items={list} activeId={activeId} onOpen={() => setDrawer(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function DocTree({ projectId, canWrite, items, activeId, onOpen }: { projectId: string; canWrite: boolean; items: DocumentListItem[]; activeId: string | null; onOpen: () => void }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (kind: DocumentKind) => api<Document>(`/api/v1/projects/${projectId}/documents`, { method: 'POST', body: { title: kind === 'Decision' ? 'Neue Entscheidung' : 'Neue Seite', kind } }),
    onSuccess: async (document) => {
      await client.invalidateQueries({ queryKey: ['documents', projectId] })
      onOpen()
      await navigate(`/projekte/${projectId}/dokumente/${document.id}`)
    },
  })
  const [query, setQuery] = useState('')
  const [openIds, setOpenIds] = useState<string[] | null>(() => readOpen(projectId))
  const path = useMemo(() => ancestors(items, activeId), [items, activeId])
  const visibleOpen = openIds ?? defaultOpen(items, path)
  useEffect(() => {
    if (items.length === 0) return
    setOpenIds((current) => {
      const base = current ?? defaultOpen(items, path)
      const next = [...new Set([...base, ...path])]
      if (current && sameIds(current, next)) return current
      writeOpen(projectId, next)
      return next
    })
  }, [projectId, items, path])
  function toggle(id: string) {
    setOpenIds((current) => {
      const base = current ?? defaultOpen(items, path)
      const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id]
      writeOpen(projectId, next)
      return next
    })
  }
  const needle = query.trim().toLowerCase()
  const hits = needle ? items.filter((item) => item.title.toLowerCase().includes(needle)) : []
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h2 className="text-sm font-semibold">Seiten</h2>
        <Link className="text-xs text-accent underline-offset-2 hover:underline" to={`/projekte/${projectId}/dokumente/katalog`}>Datenmodell</Link>
        <span className="mr-auto pl-1 text-xs text-muted">{items.length}</span>
        {canWrite ? (
          <Menu trigger={<Button size="sm" type="button" variant="primary">Neu</Button>}>
            <MenuItem onSelect={() => create.mutate('Page')}>Seite anlegen</MenuItem>
            <MenuItem onSelect={() => create.mutate('Decision')}>Entscheidung anlegen</MenuItem>
          </Menu>
        ) : null}
      </div>
      <div className="grid gap-1 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" size={14} aria-hidden="true" />
          <input className="h-8 w-full rounded-md border border-line bg-card pr-2 pl-8 text-sm" aria-label="Seitenbaum durchsuchen" placeholder="Seitentitel" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {!needle && visibleOpen.length > path.length + 1 ? (
          <button className="justify-self-start text-xs text-muted underline-offset-2 hover:underline" type="button" onClick={() => { writeOpen(projectId, path); setOpenIds(path) }}>Auf den Pfad reduzieren</button>
        ) : null}
      </div>
      <div className="studio-scroll min-h-0 flex-1 px-2 pb-3">
        {needle ? (
          hits.length === 0 ? <p className="px-2 py-2 text-sm text-muted">Keine Seite mit diesem Titel.</p> : (
            <ul className="grid gap-0.5">
              {hits.map((item) => (
                <li key={item.id}>
                  <Link className="block rounded-md px-2 py-1.5 hover:bg-background" to={`/projekte/${projectId}/dokumente/${item.id}`} onClick={onOpen}>
                    <span className="block truncate text-sm font-medium" title={item.title}>{item.title}</span>
                    <span className="block truncate text-xs text-muted">{documentPath(items, item.id)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          <TreeNodes projectId={projectId} items={items} parentId={null} depth={0} openIds={visibleOpen} activeId={activeId} onToggle={toggle} onOpen={onOpen} />
        )}
      </div>
    </div>
  )
}

function TreeNodes({ projectId, items, parentId, depth, openIds, activeId, onToggle, onOpen }: { projectId: string; items: DocumentListItem[]; parentId: string | null; depth: number; openIds: string[]; activeId: string | null; onToggle: (id: string) => void; onOpen: () => void }) {
  const children = items.filter((item) => item.parentId === parentId)
  if (children.length === 0) return null
  const nestedCount = new Map<string, number>()
  for (const item of items) {
    if (!item.parentId) continue
    nestedCount.set(item.parentId, (nestedCount.get(item.parentId) ?? 0) + 1)
  }
  return (
    <ul className={`grid gap-0.5 ${depth > 0 ? 'ml-3 border-l border-line pl-1' : ''}`}>
      {children.map((item) => {
        const nested = nestedCount.has(item.id)
        const open = openIds.includes(item.id)
        const active = item.id === activeId
        return (
          <li key={item.id} className="min-w-0">
            <div className="flex min-w-0 items-center">
              {nested ? (
                <button className="grid h-7 w-6 shrink-0 place-items-center rounded-md hover:bg-background" type="button" aria-expanded={open} aria-label={open ? `${item.title} zuklappen` : `${item.title} aufklappen`} onClick={() => onToggle(item.id)}>
                  <ChevronRight size={14} className={open ? 'rotate-90 transition-transform duration-150' : 'transition-transform duration-150'} aria-hidden="true" />
                </button>
              ) : <span className="w-6 shrink-0" />}
              <Link
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm ${active ? 'bg-accent/12 font-medium text-accent' : 'hover:bg-background'}`}
                to={`/projekte/${projectId}/dokumente/${item.id}`}
                aria-current={active ? 'page' : undefined}
                title={item.title}
                ref={active ? scrollActive : undefined}
                onClick={onOpen}
              >
                {item.kind === 'Decision' ? <Scale size={14} className="shrink-0" aria-hidden="true" /> : <FileText size={14} className="shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              </Link>
              {nested ? <span className="shrink-0 pr-1 text-xs text-muted">{nestedCount.get(item.id)}</span> : null}
            </div>
            {nested && open ? <TreeNodes projectId={projectId} items={items} parentId={item.id} depth={depth + 1} openIds={openIds} activeId={activeId} onToggle={onToggle} onOpen={onOpen} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

function scrollActive(node: HTMLAnchorElement | null) {
  node?.scrollIntoView({ block: 'nearest' })
}

function ancestors(items: DocumentListItem[], id: string | null) {
  const parents = new Map(items.map((item) => [item.id, item.parentId]))
  const path: string[] = []
  let current = id ? parents.get(id) : null
  while (current) {
    path.push(current)
    current = parents.get(current) ?? null
  }
  return path
}

function documentPath(items: DocumentListItem[], id: string) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const names: string[] = []
  let current = byId.get(id)?.parentId ?? null
  while (current) {
    const item = byId.get(current)
    if (!item) break
    names.unshift(item.title)
    current = item.parentId
  }
  return names.length ? names.join(' / ') : 'Oberste Ebene'
}

function defaultOpen(items: DocumentListItem[], path: string[]) {
  const roots = items.filter((item) => !item.parentId && items.some((child) => child.parentId === item.id)).map((item) => item.id)
  return [...new Set([...roots, ...path])]
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const values = new Set(left)
  return right.every((item) => values.has(item))
}

function readOpen(projectId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`studio-doc-open-${projectId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : null
  } catch {
    return null
  }
}

function writeOpen(projectId: string, ids: string[]) {
  localStorage.setItem(`studio-doc-open-${projectId}`, JSON.stringify(ids))
}

export function DocumentEditorPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { documentId = '' } = useParams()
  const document = useQuery({
    queryKey: ['document', project.id, documentId],
    queryFn: () => api<Document>(`/api/v1/projects/${project.id}/documents/${documentId}`),
  })
  const [generation, setGeneration] = useState(0)
  if (document.isLoading) return <Loading />
  if (document.isError) return <div className="p-6"><ErrorState error={document.error} onRetry={() => void document.refetch()} /></div>
  return (
    <DocFrame projectId={project.id} canWrite={canWrite} activeId={document.data!.id}>
      <DocumentEditor
        key={`${document.data!.id}-${generation}`}
        projectId={project.id}
        canWrite={canWrite}
        initial={document.data!}
        reload={async () => {
          await document.refetch()
          setGeneration((value) => value + 1)
        }}
      />
    </DocFrame>
  )
}

function DocumentEditor({ projectId, canWrite, initial, reload }: { projectId: string; canWrite: boolean; initial: Document; reload: () => Promise<unknown> }) {
  const documents = useQuery({ queryKey: ['documents', projectId], queryFn: () => api<DocumentListItem[]>(`/api/v1/projects/${projectId}/documents`) })
  const revisions = useQuery({ queryKey: ['revisions', projectId, initial.id], queryFn: () => api<Revision[]>(`/api/v1/projects/${projectId}/documents/${initial.id}/revisions`) })
  const [title, setTitle] = useState(initial.title)
  const [status, setStatus] = useState(initial.status)
  const [content, setContent] = useState(initial.contentJson)
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(initial.version)
  const [revision, setRevision] = useState<number | null>(null)
  const [parentId, setParentId] = useState(initial.parentId ?? '')
  const [message, setMessage] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [webOpen, setWebOpen] = useState(false)
  const [href, setHref] = useState('')
  const [term, setTerm] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const client = useQueryClient()
  deletedIds.clear()
  for (const embed of initial.embeds) if (embed.deleted) deletedIds.add(embed.id)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      Placeholder.configure({ placeholder: 'Schreibe hier …' }),
      TaskList,
      TaskItem,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ArtifactLink,
    ],
    content: JSON.parse(initial.contentJson) as object,
    editable: false,
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction.docChanged) return
      setContent(JSON.stringify(current.getJSON()))
      setDirty(true)
    },
  })
  useEffect(() => {
    if (!editor || dirty || initial.version <= version) return
    setTitle(initial.title)
    setStatus(initial.status)
    setContent(initial.contentJson)
    setVersion(initial.version)
    editor.commands.setContent(JSON.parse(initial.contentJson) as object, { emitUpdate: false })
  }, [dirty, editor, initial, version])
  const autosave = useAutosave({
    enabled: canWrite,
    dirty,
    version,
    signature: JSON.stringify({ title, status, content }),
    save: async (currentVersion) => {
      const saved = await api<Document>(`/api/v1/projects/${projectId}/documents/${initial.id}`, {
        method: 'PUT',
        body: { version: currentVersion, title, status, contentJson: content },
      })
      setVersion(saved.version)
      setDirty(false)
      client.setQueryData(['document', projectId, initial.id], saved)
      await client.invalidateQueries({ queryKey: ['revisions', projectId, initial.id] })
      return saved.version
    },
  })
  const move = useMutation({
    mutationFn: () => api<Document>(`/api/v1/projects/${projectId}/documents/${initial.id}/move`, {
      method: 'POST',
      body: { version, parentId: parentId || null, sortOrder: initial.sortOrder },
    }),
    onSuccess: async (saved) => {
      setVersion(saved.version)
      setMessage('Seite verschoben.')
      await client.invalidateQueries({ queryKey: ['documents', projectId] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const restore = useMutation({
    mutationFn: (number: number) => api<Document>(`/api/v1/projects/${projectId}/documents/${initial.id}/revisions/${number}/restore`, { method: 'POST', body: { version } }),
    onSuccess: async () => {
      setDirty(false)
      autosave.clearConflict()
      await reload()
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const impact = useQuery({
    queryKey: ['impact', projectId, initial.id],
    queryFn: () => api<Impact>(`/api/v1/projects/${projectId}/artifacts/${initial.id}/impact`),
    enabled: deleteOpen,
  })
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/projects/${projectId}/artifacts/${initial.id}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.assign(`/projekte/${projectId}/dokumente`) },
  })
  const search = useQuery({
    queryKey: ['doc-search', projectId, term],
    queryFn: () => api<SearchHit[]>(`/api/v1/projects/${projectId}/search?q=${encodeURIComponent(term)}`),
    enabled: term.trim().length > 1,
  })
  const parents = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const item of documents.data ?? []) map[item.id] = item.parentId
    return map
  }, [documents.data])
  const opened = useQuery({
    queryKey: ['revision', projectId, initial.id, revision],
    queryFn: () => api<Revision>(`/api/v1/projects/${projectId}/documents/${initial.id}/revisions/${revision}`),
    enabled: revision !== null,
  })

  useEffect(() => {
    editor?.setEditable(editing && canWrite)
  }, [editor, editing, canWrite])

  useEffect(() => () => { editor?.destroy() }, [editor])

  const path = documentPath(documents.data ?? [], initial.id)
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 md:px-8">
      <LeaveGuard when={dirty || autosave.state === 'conflict'} />
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="truncate font-mono text-xs text-muted" title={path}>{path}</p>
          <div className="flex items-center gap-2">
            <SaveBadge state={autosave.state} />
            {canWrite ? (
              <Button size="sm" type="button" variant={editing ? 'secondary' : 'primary'} onClick={() => setEditing((value) => !value)}>{editing ? 'Fertig' : 'Bearbeiten'}</Button>
            ) : null}
          </div>
        </div>
        <Input className="h-auto cursor-text border-transparent bg-transparent px-0 text-4xl font-semibold tracking-tight read-only:cursor-default" aria-label="Seitentitel" value={title} readOnly={!editing} onChange={(event) => { setTitle(event.target.value); setDirty(true) }} />
        {initial.kind === 'Decision' ? (
          editing ? (
            <Field label="Status">
              <Select value={status} onChange={(event) => { setStatus(event.target.value as DocumentStatus); setDirty(true) }}>
                {(['Vorgeschlagen', 'Akzeptiert', 'Abgeloest'] as DocumentStatus[]).map((item) => <option key={item} value={item}>{documentStatusLabel(item)}</option>)}
              </Select>
            </Field>
          ) : (
            <Badge tone="accent">{documentStatusLabel(status)}</Badge>
          )
        ) : null}
        {autosave.state === 'conflict' ? (
          <ConflictBanner onReload={() => { setDirty(false); autosave.clearConflict(); void reload() }} onKeep={() => autosave.retry()} />
        ) : null}
        {editing ? <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-nav/95 p-1 shadow-sm backdrop-blur" role="toolbar" aria-label="Textformatierung">
          <FormatButton label="Große Überschrift" pressed={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></FormatButton>
          <FormatButton label="Überschrift" pressed={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></FormatButton>
          <FormatButton label="Untertitel" pressed={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></FormatButton>
          <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <FormatButton label="Fett" pressed={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></FormatButton>
          <FormatButton label="Kursiv" pressed={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></FormatButton>
          <FormatButton label="Unterstrichen" pressed={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline size={15} /></FormatButton>
          <FormatButton label="Durchgestrichen" pressed={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></FormatButton>
          <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <FormatButton label="Liste" pressed={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></FormatButton>
          <FormatButton label="Nummerierung" pressed={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></FormatButton>
          <FormatButton label="Aufgaben" pressed={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()}><ListChecks size={15} /></FormatButton>
          <FormatButton label="Zitat" pressed={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={15} /></FormatButton>
          <FormatButton label="Trennlinie" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus size={15} /></FormatButton>
          <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <FormatButton label="Tabelle" pressed={editor?.isActive('table')} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15} /></FormatButton>
          <FormatButton label="Codezeichen" pressed={editor?.isActive('code')} onClick={() => editor?.chain().focus().toggleCode().run()}><Code size={15} /></FormatButton>
          <FormatButton label="Code" pressed={editor?.isActive('codeBlock')} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><span className="font-mono text-xs">{'</>'}</span></FormatButton>
          <FormatButton label="Weblink" pressed={editor?.isActive('link')} onClick={() => { setHref(String(editor?.getAttributes('link').href ?? '')); setWebOpen(true) }}><Link2 size={15} /></FormatButton>
          <FormatButton label="Artefaktlink" onClick={() => setLinkOpen(true)}><span className="text-xs font-medium">Artefakt</span></FormatButton>
        </div> : null}
        {editing && editor?.isActive('table') ? (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>Zeile darunter</Button>
            <Button size="sm" type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>Spalte rechts</Button>
            <Button size="sm" type="button" variant="danger" onClick={() => editor.chain().focus().deleteTable().run()}>Tabelle entfernen</Button>
          </div>
        ) : null}
        <div className={`studio-prose ${editing ? 'min-h-80 rounded-2xl border border-line bg-card px-6 py-6 shadow-sm' : 'is-reading px-1 py-1'}`}>
          <EditorContent editor={editor} />
        </div>
        {initial.embeds.some((embed) => embed.deleted) ? <p className="text-sm text-warning">Mindestens ein interner Link zeigt auf ein gelöschtes Artefakt.</p> : null}
      </section>
      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid gap-3">
          <div className="rounded-xl border border-line bg-card px-4 py-3">
            <SourcesPanel projectId={projectId} artifactId={initial.id} canWrite={canWrite} compact />
          </div>
          <div className="rounded-xl border border-line bg-card px-4 py-3">
            <h2 className="text-sm font-semibold">Struktur</h2>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Field label="Übergeordnete Seite">
                  <Select aria-label="Übergeordnete Seite" value={parentId} disabled={!canWrite || initial.kind === 'Decision'} onChange={(event) => setParentId(event.target.value)}>
                    <option value="">Oberste Ebene</option>
                    {(documents.data ?? []).filter((item) => item.kind === 'Page' && item.id !== initial.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </Select>
                </Field>
              </div>
              <Button size="sm" type="button" disabled={!canWrite} onClick={() => {
                if (createsCycle(initial.id, parentId || null, parents)) {
                  setMessage('Die Seite kann nicht unter eine ihrer eigenen Unterseiten verschoben werden.')
                  return
                }
                move.mutate()
              }}>Verschieben</Button>
              {canWrite ? <Button size="sm" type="button" variant="danger" onClick={() => setDeleteOpen(true)}>Löschen</Button> : null}
            </div>
            {message ? <p role="status" className="mt-2 text-sm">{message}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <details className="group rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-medium">
                <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                Verknüpfungen
              </summary>
              <div className="border-t border-line px-4 py-3">
                <LinkPanel projectId={projectId} artifactId={initial.id} mode="document" canWrite={false} heading={false} />
              </div>
            </details>
            <details className="group rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-medium">
                <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                Auswirkungen
              </summary>
              <div className="border-t border-line px-4 py-3">
                <UsagePanel projectId={projectId} artifactId={initial.id} title={initial.title} heading={false} />
              </div>
            </details>
          </div>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="text-sm font-semibold">Revisionen</h2>
          {revisions.data && revisions.data.length === 0 ? <p className="text-sm text-muted">Noch keine gespeicherte Revision.</p> : null}
          {revisions.data && revisions.data.length > 0 ? (
            <ul className="studio-scroll max-h-64 rounded-xl border border-line bg-card">
              {revisions.data.map((item) => (
                <li key={item.id} className="border-b border-line last:border-b-0">
                  <button className={`w-full px-3 py-1.5 text-left text-sm hover:bg-background ${revision === item.number ? 'bg-background text-accent' : ''}`} type="button" onClick={() => setRevision(item.number)}>
                    <span className="block truncate">{item.number}. {item.title}</span>
                    <span className="block truncate text-xs text-muted">{item.authorName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      {opened.data ? (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          <p className="font-medium">Revision {opened.data.number}</p>
          <p className="text-muted">{new Date(opened.data.createdAt).toLocaleString('de-DE')} · {opened.data.authorName}</p>
          <pre className="studio-scroll mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{plain(opened.data.contentJson)}</pre>
          {canWrite ? <Button className="mt-2" size="sm" type="button" onClick={() => restore.mutate(opened.data!.number)}>Als neue Revision wiederherstellen</Button> : null}
        </div>
      ) : null}
      <Modal open={webOpen} onOpenChange={setWebOpen} title="Weblink">
        <Field label="Adresse">
          <Input aria-label="Adresse" value={href} placeholder="https://…" onChange={(event) => setHref(event.target.value)} />
        </Field>
        {href.trim() && !safeHref(href.trim()) ? <p role="alert" className="text-sm text-danger">Die Adresse muss mit http, https, mailto oder / beginnen.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" disabled={!safeHref(href.trim())} onClick={() => { editor?.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run(); setWebOpen(false) }}>Link setzen</Button>
          {editor?.isActive('link') ? <Button type="button" variant="ghost" onClick={() => { editor.chain().focus().unsetLink().run(); setWebOpen(false) }}>Weblink entfernen</Button> : null}
        </div>
      </Modal>
      <Modal open={linkOpen} onOpenChange={setLinkOpen} title="Interner Artefaktlink">
        <Input value={term} aria-label="Artefakt suchen" placeholder="Suchen" onChange={(event) => setTerm(event.target.value)} />
        <ul className="mt-2 grid gap-1">
          {search.data?.map((hit) => (
            <li key={`${hit.type}-${hit.id}`}>
              <button className="text-sm underline" type="button" onClick={() => {
                editor?.chain().focus().insertContent({ type: 'artifactLink', attrs: { artifactId: hit.id, label: hit.title, artifactType: hit.type, diagramId: hit.diagramId } }).run()
                setLinkOpen(false)
                setTerm('')
              }}>{hit.title}</button>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title="Seite löschen">
        {impact.data ? <ImpactList impact={impact.data} /> : <p>Auswirkungen werden geladen …</p>}
        {remove.isError ? <p className="text-sm text-danger">{errorText(remove.error)}</p> : null}
        <Button type="button" variant="danger" disabled={impact.data ? !impact.data.canDelete : true} onClick={() => remove.mutate()}>Endgültig löschen</Button>
      </Modal>
    </div>
  )
}

function FormatButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="sm" type="button" aria-label={label} title={label} aria-pressed={pressed} variant={pressed ? 'primary' : 'secondary'} onClick={onClick}>
      {children}
    </Button>
  )
}

function safeHref(value: string) {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

function plain(json: string) {
  try {
    const parts: string[] = []
    const walk = (node: { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] }) => {
      if (node.type === 'artifactLink' && node.attrs?.label) parts.push(node.attrs.label)
      if (node.text) parts.push(node.text)
      for (const child of node.content ?? []) walk(child as { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] })
    }
    walk(JSON.parse(json) as { text?: string; content?: unknown[] })
    return parts.join(' ')
  } catch {
    return 'Die Revision kann nicht angezeigt werden.'
  }
}
