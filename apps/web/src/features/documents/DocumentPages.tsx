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
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { LeaveGuard } from '../../components/LeaveGuard'
import { EmptyState, ErrorState, Loading, SaveBadge } from '../../components/states'
import { Button, Field, Input, Modal, Select } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { useAutosave } from '../../lib/autosave'
import { artifactHref, createsCycle, documentStatusLabel } from '../../lib/labels'
import type { Document, DocumentKind, DocumentListItem, DocumentStatus, Revision, SearchHit } from '../../lib/types'
import { LinkPanel } from '../links/LinkPanel'
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
  const client = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (kind: DocumentKind) => api<Document>(`/api/v1/projects/${project.id}/documents`, { method: 'POST', body: { title: kind === 'Decision' ? 'Neue Entscheidung' : 'Neue Seite', kind } }),
    onSuccess: async (document) => {
      await client.invalidateQueries({ queryKey: ['documents', project.id] })
      await navigate(`/projekte/${project.id}/dokumente/${document.id}`)
    },
  })
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[16rem_minmax(0,1fr)] md:p-6">
      <aside>
        <h1 className="text-xl font-semibold">Dokumentation</h1>
        {canWrite ? (
          <div className="mt-3 grid gap-2">
            <Button type="button" onClick={() => create.mutate('Page')}>Seite anlegen</Button>
            <Button type="button" onClick={() => create.mutate('Decision')}>Entscheidung anlegen</Button>
          </div>
        ) : null}
        {documents.isLoading ? <Loading /> : null}
        {documents.isError ? <ErrorState error={documents.error} onRetry={() => void documents.refetch()} /> : null}
        {documents.data ? <Tree projectId={project.id} items={documents.data} parentId={null} /> : null}
      </aside>
      <section>
        {documents.data?.length === 0 ? <EmptyState title="Noch keine Seiten" body="Lege eine Seite oder eine Architekturentscheidung an." /> : <p className="text-sm text-muted">Wähle eine Seite in der Struktur.</p>}
      </section>
    </div>
  )
}

function Tree({ projectId, items, parentId }: { projectId: string; items: DocumentListItem[]; parentId: string | null }) {
  const children = items.filter((item) => item.parentId === parentId)
  if (children.length === 0) return null
  return (
    <ul className="mt-2 grid gap-1 pl-3">
      {children.map((item) => (
        <li key={item.id}>
          <Link className="text-sm underline" to={`/projekte/${projectId}/dokumente/${item.id}`}>{item.title}</Link>
          <Tree projectId={projectId} items={items} parentId={item.id} />
        </li>
      ))}
    </ul>
  )
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
  const [term, setTerm] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const client = useQueryClient()
  deletedIds.clear()
  for (const embed of initial.embeds) if (embed.deleted) deletedIds.add(embed.id)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
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
    editable: canWrite,
    onUpdate: ({ editor: current }) => {
      setContent(JSON.stringify(current.getJSON()))
      setDirty(true)
    },
  })
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

  useEffect(() => () => { editor?.destroy() }, [editor])

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[16rem_minmax(0,1fr)_18rem]">
      <LeaveGuard when={dirty || autosave.state === 'conflict'} />
      <aside>
        <DocumentsTree projectId={projectId} />
      </aside>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Seitentitel" value={title} disabled={!canWrite} onChange={(event) => { setTitle(event.target.value); setDirty(true) }} />
          <SaveBadge state={autosave.state} />
        </div>
        {initial.kind === 'Decision' ? (
          <Field label="Status">
            <Select value={status} disabled={!canWrite} onChange={(event) => { setStatus(event.target.value as DocumentStatus); setDirty(true) }}>
              {(['Vorgeschlagen', 'Akzeptiert', 'Abgeloest'] as DocumentStatus[]).map((item) => <option key={item} value={item}>{documentStatusLabel(item)}</option>)}
            </Select>
          </Field>
        ) : <p className="text-sm text-muted">Seite</p>}
        {autosave.state === 'conflict' ? (
          <div role="alert" className="rounded-md border border-warning p-3 text-sm">
            Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.
            <Button className="ml-2" size="sm" type="button" onClick={() => { setDirty(false); autosave.clearConflict(); void reload() }}>Serverstand laden</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Textformatierung">
          <Button size="sm" type="button" aria-pressed={Boolean(editor?.isActive('heading', { level: 2 }))} variant={editor?.isActive('heading', { level: 2 }) ? 'primary' : 'secondary'} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>Überschrift</Button>
          <Button size="sm" type="button" aria-pressed={Boolean(editor?.isActive('bold'))} variant={editor?.isActive('bold') ? 'primary' : 'secondary'} onClick={() => editor?.chain().focus().toggleBold().run()}>Fett</Button>
          <Button size="sm" type="button" aria-pressed={Boolean(editor?.isActive('italic'))} variant={editor?.isActive('italic') ? 'primary' : 'secondary'} onClick={() => editor?.chain().focus().toggleItalic().run()}>Kursiv</Button>
          <Button size="sm" type="button" aria-pressed={Boolean(editor?.isActive('bulletList'))} variant={editor?.isActive('bulletList') ? 'primary' : 'secondary'} onClick={() => editor?.chain().focus().toggleBulletList().run()}>Liste</Button>
          <Button size="sm" type="button" aria-pressed={Boolean(editor?.isActive('taskList'))} variant={editor?.isActive('taskList') ? 'primary' : 'secondary'} onClick={() => editor?.chain().focus().toggleTaskList().run()}>Aufgaben</Button>
          <Button size="sm" type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Tabelle</Button>
          <Button size="sm" type="button" aria-pressed={Boolean(editor?.isActive('codeBlock'))} variant={editor?.isActive('codeBlock') ? 'primary' : 'secondary'} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>Code</Button>
          <Button size="sm" type="button" onClick={() => setLinkOpen(true)}>Artefaktlink</Button>
        </div>
        <div className="studio-prose min-h-80 rounded-lg border border-line bg-card p-6">
          <EditorContent editor={editor} />
        </div>
        {initial.embeds.some((embed) => embed.deleted) ? <p className="text-sm text-warning">Mindestens ein interner Link zeigt auf ein gelöschtes Artefakt.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Übergeordnete Seite" value={parentId} disabled={!canWrite || initial.kind === 'Decision'} onChange={(event) => setParentId(event.target.value)}>
            <option value="">Oberste Ebene</option>
            {(documents.data ?? []).filter((item) => item.kind === 'Page' && item.id !== initial.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
          <Button type="button" disabled={!canWrite} onClick={() => {
            if (createsCycle(initial.id, parentId || null, parents)) {
              setMessage('Die Seite kann nicht unter eine ihrer eigenen Unterseiten verschoben werden.')
              return
            }
            move.mutate()
          }}>Verschieben</Button>
          {canWrite ? <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>Löschen</Button> : null}
        </div>
        {message ? <p role="status" className="text-sm">{message}</p> : null}
      </section>
      <aside className="grid content-start gap-3">
        <h2 className="font-semibold">Revisionen</h2>
        <ul className="grid gap-1">
          {revisions.data?.map((item) => (
            <li key={item.id}>
              <button className="text-left text-sm underline" type="button" onClick={() => setRevision(item.number)}>
                {item.number}. {item.title} · {item.authorName}
              </button>
            </li>
          ))}
        </ul>
        {opened.data ? (
          <div className="rounded-lg border border-line p-3 text-sm">
            <p className="font-medium">Revision {opened.data.number}</p>
            <p className="text-muted">{new Date(opened.data.createdAt).toLocaleString('de-DE')} · {opened.data.authorName}</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{plain(opened.data.contentJson)}</pre>
            {canWrite ? <Button className="mt-2" size="sm" type="button" onClick={() => restore.mutate(opened.data!.number)}>Als neue Revision wiederherstellen</Button> : null}
          </div>
        ) : null}
        <LinkPanel projectId={projectId} artifactId={initial.id} mode="document" canWrite={false} />
        <UsagePanel projectId={projectId} artifactId={initial.id} title={initial.title} />
      </aside>
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

function DocumentsTree({ projectId }: { projectId: string }) {
  const documents = useQuery({ queryKey: ['documents', projectId], queryFn: () => api<DocumentListItem[]>(`/api/v1/projects/${projectId}/documents`) })
  if (!documents.data) return null
  return <Tree projectId={projectId} items={documents.data} parentId={null} />
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
