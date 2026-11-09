import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type AuthState = {
  session: Session | null
  isAdmin: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ session: null, isAdmin: false, loading: false, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      setIsAdmin(false)
      return
    }
    // UI hint only. Every admin action is enforced again in the database (require_admin()).
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(data === true))
  }, [session])

  const signOut = async () => {
    await supabase?.auth.signOut()
  }

  return <AuthContext.Provider value={{ session, isAdmin, loading, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
