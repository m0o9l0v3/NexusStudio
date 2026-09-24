import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { SessionExpiryProvider } from './auth/SessionExpiryProvider'
import './index.css'
import { router } from './router'
import { UnsavedChangesProvider } from './shell/UnsavedChangesProvider'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionExpiryProvider>
        <UnsavedChangesProvider>
          <RouterProvider router={router} />
        </UnsavedChangesProvider>
      </SessionExpiryProvider>
    </QueryClientProvider>
  </StrictMode>,
)
