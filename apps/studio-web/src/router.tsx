import { createBrowserRouter, Navigate } from 'react-router'
import type { TargetKind } from './api/releases'
import { RequireAuth } from './auth/RequireAuth'
import { EventListPage } from './pages/events/EventListPage'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { AppShell } from './shell/AppShell'
import { navAreas } from './shell/navigation'
import { FullPageStatus } from './ui/FullPageStatus'

/** 専用の画面がある領域。それ以外は準備中の表示にする。 */
const implemented = new Set(['/overview', '/events', '/open-campus', '/spots', '/validation', '/releases', '/logs'])

async function loadOverview() {
  const { OverviewPage } = await import('./pages/overview/OverviewPage')
  return { Component: OverviewPage }
}

async function loadCategories() {
  const { CategoriesPage } = await import('./pages/events/CategoriesPage')
  return { Component: CategoriesPage }
}

async function loadEventEditor() {
  const { EventEditorPage } = await import('./pages/events/editor/EventEditorPage')
  return { Component: EventEditorPage }
}

async function loadOpenCampusList() {
  const { OpenCampusListPage } = await import('./pages/openCampus/OpenCampusListPage')
  return { Component: OpenCampusListPage }
}

async function loadOccurrenceEditor() {
  const { OccurrenceEditorPage } = await import('./pages/openCampus/OccurrenceEditorPage')
  return { Component: OccurrenceEditorPage }
}

async function loadSpots() {
  const { SpotsPage } = await import('./pages/spots/SpotsPage')
  return { Component: SpotsPage }
}

async function loadValidation() {
  const { ValidationPage } = await import('./pages/validation/ValidationPage')
  return { Component: ValidationPage }
}

async function loadReleases() {
  const { ReleasesPage } = await import('./pages/releases/ReleasesPage')
  return { Component: ReleasesPage }
}

async function loadLogs() {
  const { LogsPage } = await import('./pages/logs/LogsPage')
  return { Component: LogsPage }
}

function loadPublishReview(kind: TargetKind) {
  return async () => {
    const { PublishReviewPage } = await import('./publishing/PublishReviewPage')
    return { element: <PublishReviewPage kind={kind} /> }
  }
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    hydrateFallbackElement: <FullPageStatus title="読み込んでいます" message="画面を準備しています。" busy />,
    children: [
      {
        element: <AppShell />,
        children: [
          // ログイン後はOverviewへ直接入る（12 §1、16 §2）。
          { index: true, element: <Navigate to="/overview" replace /> },
          // 1280px未満にも対応した画面（handle.responsive）。他の画面は対応するまで最小幅1280pxのまま（検証記録 A-5 D9）。
          { path: '/overview', lazy: loadOverview, handle: { responsive: true } },
          { path: '/events', element: <EventListPage />, handle: { responsive: true } },
          { path: '/events/new', lazy: loadEventEditor, handle: { responsive: true } },
          { path: '/events/categories', lazy: loadCategories, handle: { responsive: true } },
          { path: '/events/categories/publish', lazy: loadPublishReview('categories'), handle: { responsive: true } },
          { path: '/events/:id', lazy: loadEventEditor, handle: { responsive: true } },
          { path: '/events/:id/publish', lazy: loadPublishReview('event'), handle: { responsive: true } },
          { path: '/open-campus', lazy: loadOpenCampusList, handle: { responsive: true } },
          { path: '/open-campus/new', lazy: loadOccurrenceEditor, handle: { responsive: true } },
          { path: '/open-campus/:id', lazy: loadOccurrenceEditor, handle: { responsive: true } },
          { path: '/open-campus/:id/publish', lazy: loadPublishReview('occurrence'), handle: { responsive: true } },
          { path: '/spots', lazy: loadSpots, handle: { responsive: true } },
          { path: '/spots/publish', lazy: loadPublishReview('spot'), handle: { responsive: true } },
          // 地図の公開確認だけを置く。Map Data 画面（一覧・差分表示）は構成の確定後に作る（UI補完記録）。
          { path: '/map-data/publish', lazy: loadPublishReview('map'), handle: { responsive: true } },
          { path: '/validation', lazy: loadValidation, handle: { responsive: true } },
          { path: '/releases', lazy: loadReleases, handle: { responsive: true } },
          { path: '/logs', lazy: loadLogs, handle: { responsive: true } },
          ...navAreas
            .filter((area) => !implemented.has(area.path))
            .map((area) => ({ path: area.path, element: <PlaceholderPage area={area} /> })),
          { path: '*', element: <Navigate to="/overview" replace /> },
        ],
      },
    ],
  },
])
