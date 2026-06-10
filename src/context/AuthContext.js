import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, client_id')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Profile fetch error:', error)
        setLoading(false)
        return
      }

      // If profile has a client_id, fetch client details separately
      if (data && data.client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('id, name, location')
          .eq('id', data.client_id)
          .single()
        data.clients = client
      }

      setProfile(data)
    } catch (err) {
      console.error('Unexpected error fetching profile:', err)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const clientId = profile?.client_id || null
  const isAdmin = profile?.role === 'admin'

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, clientId, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
