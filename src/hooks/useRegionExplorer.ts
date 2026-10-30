/**
 * Central UI state for the Region Resilience Explorer.
 *
 * Holds the loaded dataset, the active filter criteria, the selected primary
 * Region and the set of selected secondary candidates, and derives the visible
 * (filtered) Region set plus the ranked DR-candidate list by great-circle
 * separation (ARCHITECTURE.md §9).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadRegions } from '../data/loadRegions';
import type { Region } from '../data/types';
import { filterRegions, type FilterCriteria } from '../data/filters';
import { haversineKm } from '../data/geo';

/** A DR candidate paired with its approximate great-circle separation (km). */
export interface RankedCandidate {
  region: Region;
  /** Approximate great-circle separation from the primary, in km. */
  separationKm: number;
}

export interface RegionExplorerState {
  loading: boolean;
  error: string | null;
  usedFixture: boolean;
  /** All Regions in the dataset. */
  allRegions: Region[];
  /** Regions passing the current filter (the on-map marker set). */
  visibleRegions: Region[];
  filters: FilterCriteria;
  setFilters: (next: FilterCriteria) => void;
  /** Selected primary Region code, or null. */
  primaryCode: string | null;
  setPrimary: (code: string | null) => void;
  /** Selected secondary Region codes. */
  secondaryCodes: string[];
  toggleSecondary: (code: string) => void;
  clearSelection: () => void;
  /** The resolved primary Region object, or null. */
  primary: Region | null;
  /** Secondary candidates ranked by separation from the primary (ascending). */
  rankedCandidates: RankedCandidate[];
}

/** Load the dataset once and expose explorer state + derived values. */
export function useRegionExplorer(): RegionExplorerState {
  const [allRegions, setAllRegions] = useState<Region[]>([]);
  const [usedFixture, setUsedFixture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<FilterCriteria>({});
  const [primaryCode, setPrimaryCode] = useState<string | null>(null);
  const [secondaryCodes, setSecondaryCodes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadRegions()
      .then(({ dataset, usedFixture }) => {
        if (cancelled) return;
        setAllRegions(dataset.regions);
        setUsedFixture(usedFixture);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byCode = useMemo(() => {
    const m = new Map<string, Region>();
    for (const r of allRegions) m.set(r.regionCode, r);
    return m;
  }, [allRegions]);

  const visibleRegions = useMemo(
    () => filterRegions(allRegions, filters),
    [allRegions, filters],
  );

  const primary = primaryCode ? byCode.get(primaryCode) ?? null : null;

  const setPrimary = useCallback((code: string | null) => {
    setPrimaryCode(code);
    // Dropping a region as primary should not also leave it as its own secondary.
    if (code) setSecondaryCodes((prev) => prev.filter((c) => c !== code));
  }, []);

  const toggleSecondary = useCallback(
    (code: string) => {
      if (code === primaryCode) return; // a region can't be its own secondary
      setSecondaryCodes((prev) =>
        prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
      );
    },
    [primaryCode],
  );

  const clearSelection = useCallback(() => {
    setPrimaryCode(null);
    setSecondaryCodes([]);
  }, []);

  const rankedCandidates = useMemo<RankedCandidate[]>(() => {
    if (!primary) return [];
    return secondaryCodes
      .map((code) => byCode.get(code))
      .filter((r): r is Region => Boolean(r))
      .map((region) => ({
        region,
        separationKm: haversineKm(
          { lat: primary.lat, lon: primary.lon },
          { lat: region.lat, lon: region.lon },
        ),
      }))
      .sort((a, b) => a.separationKm - b.separationKm);
  }, [primary, secondaryCodes, byCode]);

  return {
    loading,
    error,
    usedFixture,
    allRegions,
    visibleRegions,
    filters,
    setFilters,
    primaryCode,
    setPrimary,
    secondaryCodes,
    toggleSecondary,
    clearSelection,
    primary,
    rankedCandidates,
  };
}

/** Format a separation in km as a human-friendly "approximate" label. */
export function formatSeparationKm(km: number): string {
  const rounded = Math.round(km);
  return `${rounded.toLocaleString('en-US')} km`;
}
