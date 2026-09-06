import { useSyncExternalStore } from 'react'

import {
  subscribe,
  storeVersion,
  listProfiles,
  activeProfile,
  activeRelay,
  selectedWallet,
  type DfnsProfile,
  type ActiveRelay,
  type DfnsNetwork,
  type SelectedWallet,
} from './profiles'

// the store version is a primitive that changes on every profile/selection change,
// so these re-read the cheap profile functions on each store change without an
// unstable snapshot object.
export function useProfiles(): DfnsProfile[] {
  useSyncExternalStore(subscribe, storeVersion, storeVersion)
  return listProfiles()
}

export function useActiveProfile(): DfnsProfile | null {
  useSyncExternalStore(subscribe, storeVersion, storeVersion)
  return activeProfile()
}

export function useActiveRelay(): ActiveRelay | null {
  useSyncExternalStore(subscribe, storeVersion, storeVersion)
  return activeRelay()
}

export function useHasActiveRelay(): boolean {
  return useActiveRelay() !== null
}

// the wallet picked inside the active profile for this network, or null. drives
// which dfns address the dashboard treats as custody (see CustodyContext).
export function useSelectedWallet(network: DfnsNetwork): SelectedWallet | null {
  useSyncExternalStore(subscribe, storeVersion, storeVersion)
  const p = activeProfile()
  return p ? selectedWallet(p.id, network) : null
}
