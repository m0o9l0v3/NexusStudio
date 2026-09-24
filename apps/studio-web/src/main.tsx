import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { SessionExpiryProvider } from './auth/SessionExpiryProvider'
import './index.css'
import { router } from './router'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionExpiryProvider>
        <RouterProvider router={router} />
      </SessionExpiryProvider>
    </QueryClientProvider>
  </StrictMode>,
)
