import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const SUITE_RANK = { starter: 0, growth: 1, pro: 2 }

// Gates on the Suite bundle axis (clients.suite_plan) + a required module pair — independent of
// PremiumGate's per-module plan/hasFeature() machinery. Unlike ModuleGate/PremiumGate, this never
// navigates away on failure: the Owner Dashboard nav entry must always stay visible, and an
// ineligible viewer lands on an inline explanation/upsell in place instead of being bounced.
export default function SuiteGate({ children, minTier = 'growth', featureKey }) {
  const { isAdmin, imsEnabled, hrEnabled, suitePlan, hasFeature } = useAuth()
  const navigate = useNavigate()

  const modulesOk = imsEnabled && hrEnabled
  const tierOk = isAdmin || (SUITE_RANK[suitePlan] ?? -1) >= SUITE_RANK[minTier]
  const overridden = !isAdmin && featureKey && hasFeature(featureKey)

  if (isAdmin || (modulesOk && (tierOk || overridden))) return children

  if (!modulesOk) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⊛</div>
        <p style={{ fontSize: 15, color: 'var(--theme-text1)', fontWeight: 600, margin: '0 0 8px' }}>
          Owner Dashboard needs both Crest IMS and Crest HR
        </p>
        <p style={{ fontSize: 13, color: 'var(--theme-text2)', margin: 0 }}>
          Contact your consultant to activate the missing module.
        </p>
      </div>
    )
  }

  return (
    <div
      onClick={() => navigate('/pricing')}
      className="card"
      style={{ textAlign: 'center', padding: '48px 24px', cursor: 'pointer', borderStyle: 'dashed', borderColor: 'rgba(129,140,248,0.4)' }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <p style={{ fontSize: 15, color: '#818cf8', fontWeight: 700, margin: '0 0 8px' }}>Unlock with Crest Suite Growth</p>
      <p style={{ fontSize: 13, color: 'var(--theme-text2)', margin: 0 }}>
        Owner Dashboard is part of the Suite bundle — cross-module KPIs across IMS and HR. View plans →
      </p>
    </div>
  )
}
