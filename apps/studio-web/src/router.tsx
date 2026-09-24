import { createBrowserRouter, Navigate } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { AppShell } from './shell/AppShell'
import { navAreas } from './shell/navigation'

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
          ...navAreas.map((area) => ({ path: area.path, element: <PlaceholderPage area={area} /> })),
          { path: '*', element: <Navigate to="/overview" replace /> },
        ],
      },
    ],
  },
])
