import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useOutletContext } from 'react-router'
import { Toaster } from 'sonner'
import { ErrorState, Loading } from './components/states'
import { LoginPage, RegisterPage } from './features/auth/AuthPages'
import { ComponentDetailPage, ComponentsPage, DiagramEditorPage, DiagramListPage } from './features/diagram/DiagramPages'
import { DocumentEditorPage, DocumentsPage } from './features/documents/DocumentPages'
import { AreaDetailPage, AreasPage } from './features/areas/AreasPage'
import { OverviewPage } from './features/overview/OverviewPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { RequirementDetailPage, RequirementsPage } from './features/requirements/RequirementsPages'
import { ScreenEditorPage, ScreensPage } from './features/screens/ScreenPages'
import { ChangesPage, PackageDetailPage, SnapshotPage } from './features/changes/ChangesPages'
import { SettingsPage } from './features/settings/SettingsPage'
import { Shell } from './features/shell/Shell'
import { StudioProvider } from './components/ui'
import { api } from './lib/api'
import type { User } from './lib/types'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

const router = createBrowserRouter([
  { path: '/anmelden', element: <LoginPage /> },
  { path: '/registrieren', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/projekte" replace /> },
      { path: '/projekte', element: <ProjectsRoute /> },
      {
        path: '/projekte/:projectId',
        element: <ShellRoute />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'bereiche', element: <AreasPage /> },
          { path: 'bereiche/:areaId', element: <AreaDetailPage /> },
          { path: 'anforderungen', element: <RequirementsPage /> },
          { path: 'anforderungen/:requirementId', element: <RequirementDetailPage /> },
          { path: 'prozesse', element: <DiagramListPage kind="Process" /> },
          { path: 'diagramme/:diagramId', element: <DiagramEditorPage /> },
          { path: 'ui', element: <ScreensPage /> },
          { path: 'ui/:screenId', element: <ScreenEditorPage /> },
          { path: 'system', element: <DiagramListPage kind="System" /> },
          { path: 'system/komponenten', element: <ComponentsPage /> },
          { path: 'system/komponenten/:componentId', element: <ComponentDetailPage /> },
          { path: 'dokumente', element: <DocumentsPage /> },
          { path: 'dokumente/:documentId', element: <DocumentEditorPage /> },
          { path: 'aenderungen', element: <ChangesPage /> },
          { path: 'aenderungen/:packageId', element: <PackageDetailPage /> },
          { path: 'staende/:snapshotId', element: <SnapshotPage /> },
          { path: 'einstellungen', element: <SettingsPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StudioProvider>
        <RouterProvider router={router} />
        <Toaster />
      </StudioProvider>
    </QueryClientProvider>
  )
}

function RequireAuth() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User | null>('/api/v1/auth/me', { allowUnauthorized: true }),
  })
  if (me.isLoading) return <Loading label="Sitzung wird geprüft …" />
  if (me.isError) return <main className="p-6"><ErrorState error={me.error} onRetry={() => void me.refetch()} /></main>
  if (!me.data) return <Navigate to="/anmelden" replace />
  return <Outlet context={me.data} />
}

function ProjectsRoute() {
  return <ProjectsPage user={useOutletContext<User>()} />
}

function ShellRoute() {
  return <Shell user={useOutletContext<User>()} />
}
