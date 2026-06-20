import { useAuth } from '../../context/AuthContext'

// Derives Suite module flags from the clients table.
// When shared_clients schema is live (ims_enabled, pos_enabled, hr_enabled columns),
// swap the derivation below for direct reads from profile.clients.
export function useClientFeatures() {
  const { profile, plan, isAdmin } = useAuth()
  const client = profile?.clients ?? {}

  return {
    ims_enabled: isAdmin || !!client.id,
    ims_plan:    plan ?? null,

    pos_enabled: isAdmin || (client.pos_enabled ?? false),
    pos_plan:    client.pos_plan ?? null,

    hr_enabled:  isAdmin || (client.hr_enabled  ?? false),
    hr_plan:     client.hr_plan  ?? null,
  }
}
