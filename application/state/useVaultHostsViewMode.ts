import { useEffect, useState } from 'react';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';

export type VaultHostsViewMode = 'home' | 'grid' | 'list' | 'tree';

const isVaultHostsViewMode = (value: string | null): value is VaultHostsViewMode => (
  value === 'home'
  || value === 'grid'
  || value === 'list'
  || value === 'tree'
);

export const useVaultHostsViewMode = (
  storageKey: string,
  fallback: VaultHostsViewMode = 'home',
) => {
  const [viewMode, setViewMode] = useState<VaultHostsViewMode>(() => {
    const stored = localStorageAdapter.readString(storageKey);
    return isVaultHostsViewMode(stored) ? stored : fallback;
  });

  useEffect(() => {
    localStorageAdapter.writeString(storageKey, viewMode);
  }, [storageKey, viewMode]);

  return [viewMode, setViewMode] as const;
};
