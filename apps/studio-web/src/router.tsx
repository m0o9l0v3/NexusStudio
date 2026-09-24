import { createBrowserRouter, Navigate } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { CategoriesPage } from './pages/events/CategoriesPage'
import { EventEditorPage } from './pages/events/editor/EventEditorPage'
import { EventListPage } from './pages/events/EventListPage'
import { LoginPage } from './pages/LoginPage'
import { OccurrenceEditorPage } from './pages/openCampus/OccurrenceEditorPage'
import { OpenCampusListPage } from './pages/openCampus/OpenCampusListPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SpotsPage } from './pages/spots/SpotsPage'
import { AppShell } from './shell/AppShell'
import { navAreas } from './shell/navigation'

/** 専用の画面がある領域。それ以外は準備中の表示にする。 */
const implemented = new Set(['/events', '/open-campus', '/spots'])

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          // ログイン後はOverviewへ直接入る（12 §1、16 §2）。
          { index: true, element: <Navigate to="/overview" replace /> },
          { path: '/events', element: <EventListPage /> },
          { path: '/events/new', element: <EventEditorPage /> },
          { path: '/events/categories', element: <CategoriesPage /> },
          { path: '/events/:id', element: <EventEditorPage /> },
          { path: '/open-campus', element: <OpenCampusListPage /> },
          { path: '/open-campus/new', element: <OccurrenceEditorPage /> },
          { path: '/open-campus/:id', element: <OccurrenceEditorPage /> },
          { path: '/spots', element: <SpotsPage /> },
          ...navAreas
            .filter((area) => !implemented.has(area.path))
            .map((area) => ({ path: area.path, element: <PlaceholderPage area={area} /> })),
          { path: '*', element: <Navigate to="/overview" replace /> },
        ],
      },
    ],
  },
])
