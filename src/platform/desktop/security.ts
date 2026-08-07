import type {
  DesktopSecurityAPI,
  SecurityRequest,
  SecuritySnapshot,
} from '@shared/contracts/security'

function copySecurityRequest(request: SecurityRequest): SecurityRequest {
  switch (request.kind) {
    case 'save-binance-account':
      return {
        kind: request.kind,
        draft: {
          ...request.draft,
          markets: [...request.draft.markets],
        },
      }
    case 'update-preferences':
      return {
        kind: request.kind,
        preferences: { ...request.preferences },
      }
    case 'connect-account':
      return { kind: request.kind, accountId: request.accountId }
    case 'disconnect-account':
      return { kind: request.kind }
    default:
      return { ...request }
  }
}

function preloadSecurity(): DesktopSecurityAPI {
  const api = window.cryptoPro?.security
  if (!api) {
    throw new Error(
      'API Electron indisponível. Inicie a aplicação com "npm run dev".',
    )
  }
  return api
}

export function desktopSecurity(): DesktopSecurityAPI {
  const api = preloadSecurity()
  return {
    getSnapshot(): Promise<SecuritySnapshot> {
      return api.getSnapshot()
    },
    request(request: SecurityRequest): Promise<SecuritySnapshot> {
      return api.request(structuredClone(copySecurityRequest(request)))
    },
    onState(callback: (snapshot: SecuritySnapshot) => void): () => void {
      return api.onState(callback)
    },
  }
}
