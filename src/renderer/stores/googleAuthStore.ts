import { createStore, useStore } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface GoogleAuthState {
  accessToken: string | null
  refreshToken: string | null // desktop only; null on web (GIS doesn't provide refresh tokens)
  expiresAt: number | null // epoch ms
  email: string | null // optional display info
}

interface GoogleAuthActions {
  setGoogleAuth: (partial: Partial<GoogleAuthState>) => void
  clearGoogleAuth: () => void
  getGoogleAuth: () => GoogleAuthState
}

const initialState: GoogleAuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  email: null,
}

export const googleAuthStore = createStore<GoogleAuthState & GoogleAuthActions>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        ...initialState,

        setGoogleAuth: (partial: Partial<GoogleAuthState>) => {
          set((state) => {
            if (partial.accessToken !== undefined) state.accessToken = partial.accessToken
            if (partial.refreshToken !== undefined) state.refreshToken = partial.refreshToken
            if (partial.expiresAt !== undefined) state.expiresAt = partial.expiresAt
            if (partial.email !== undefined) state.email = partial.email
          })
        },

        clearGoogleAuth: () => {
          set((state) => {
            state.accessToken = null
            state.refreshToken = null
            state.expiresAt = null
            state.email = null
          })
        },

        getGoogleAuth: () => {
          return get()
        },
      })),
      {
        name: 'chatbox-google-drive-auth',
        version: 0,
        partialize: (state) => ({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          expiresAt: state.expiresAt,
          email: state.email,
        }),
      }
    )
  )
)

export function useGoogleAuthStore<U>(
  selector: Parameters<typeof useStore<typeof googleAuthStore, U>>[1]
) {
  return useStore<typeof googleAuthStore, U>(googleAuthStore, selector)
}

export const useGoogleAuth = () => {
  return useGoogleAuthStore((state) => ({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    expiresAt: state.expiresAt,
    email: state.email,
    setGoogleAuth: state.setGoogleAuth,
    clearGoogleAuth: state.clearGoogleAuth,
    getGoogleAuth: state.getGoogleAuth,
  }))
}

/** Returns true if the user has a valid (non-expired) Google access token */
export const isGoogleConnected = (): boolean => {
  const { accessToken, expiresAt } = googleAuthStore.getState()
  if (!accessToken) return false
  if (expiresAt && Date.now() >= expiresAt) return false
  return true
}
