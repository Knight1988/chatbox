import { createHashHistory, createRouter, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import platform from './platform'
import { routeTree } from './routeTree.gen'

// Get basepath from environment or default to '/'.
// BASE_PATH may have a trailing slash (e.g. "/chatbox/"); TanStack Router expects no trailing slash.
const basepath = (import.meta.env.BASE_PATH || '/').replace(/\/$/, '') || '/'

// Create a new router instance
export const router = createRouter({
  routeTree,
  basepath,
  defaultNotFoundComponent: () => {
    const navigate = useNavigate()

    useEffect(() => {
      navigate({ to: '/', replace: true }) // 重定向到首页
    }, [navigate])

    return null
  },
  history: platform.type === 'web' ? undefined : createHashHistory(),
})

export { basepath }

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
