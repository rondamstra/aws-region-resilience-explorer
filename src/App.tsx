import { useId } from 'react';
import MapView from './components/MapView';
import Disclaimer from './components/Disclaimer';
import RegionFilters from './components/RegionFilters';
import ComparisonPanel from './components/ComparisonPanel';
import ExplainerPanel from './components/ExplainerPanel';
import { useRegionExplorer } from './hooks/useRegionExplorer';
import { isProductionMapStyle } from './config/mapStyle';
import './App.css';

/**
 * AWS Region Resilience Explorer — single-page app (ARCHITECTURE.md §1).
 *
 * Wires the six MVP features: show Regions on an interactive map, pick a
 * primary, compare secondaries, draw great-circle distance lines, filter by
 * metadata, and surface the distance ≠ resilience disclaimer + explainer.
 */
export default function App() {
  const primarySelectId = useId();
  const explorer = useRegionExplorer();
  const {
    loading,
    error,
    usedFixture,
    allRegions,
    visibleRegions,
    filters,
    setFilters,
    primary,
    primaryCode,
    setPrimary,
    secondaryCodes,
    toggleSecondary,
    clearSelection,
    rankedCandidates,
  } = explorer;

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>AWS Region Resilience Explorer</h1>
          <p className="app__tagline">
            Approximate great-circle separation between AWS Regions, as a starting
            point for choosing a DR secondary.
          </p>
        </div>
        <span
          className={`app__map-mode ${isProductionMapStyle() ? 'is-prod' : 'is-local'}`}
          title={
            isProductionMapStyle()
              ? 'Rendering the Amazon Location Service Maps v2 (Standard) basemap via a restricted API key.'
              : 'Local demo basemap (no-auth OpenStreetMap raster). Set VITE_MAP_STYLE_URL (or VITE_MAP_API_KEY) to use Amazon Location Service Maps v2.'
          }
        >
          {isProductionMapStyle() ? 'Amazon Location Service' : 'Local demo basemap'}
        </span>
      </header>

      <Disclaimer />

      {loading && (
        <p className="app__status" aria-live="polite">
          Loading Region dataset…
        </p>
      )}

      {error && (
        <div className="app__error" role="alert">
          <strong>Could not load the Region dataset.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="app__status" aria-live="polite">
            Showing <strong>{visibleRegions.length}</strong> of{' '}
            <strong>{allRegions.length}</strong> commercial AWS Region
            {allRegions.length === 1 ? '' : 's'}.
            {usedFixture && (
              <span className="app__badge">
                sample fixture (real dataset not found)
              </span>
            )}
          </p>

          <main className="app__main">
            <div className="app__map-col">
              <MapView
                regions={visibleRegions}
                primary={primaryCode}
                secondaries={secondaryCodes}
                onSelect={setPrimary}
              />
            </div>

            <aside className="app__panel" aria-label="Controls and comparison">
              <section className="primary-picker" aria-labelledby="primary-heading">
                <h2 id="primary-heading" className="primary-picker__heading">
                  Primary Region
                </h2>
                <label htmlFor={primarySelectId} className="sr-only">
                  Select primary Region
                </label>
                <select
                  id={primarySelectId}
                  data-testid="primary-select"
                  value={primaryCode ?? ''}
                  onChange={(e) =>
                    setPrimary(e.target.value === '' ? null : e.target.value)
                  }
                >
                  <option value="">— none selected —</option>
                  {visibleRegions.map((r) => (
                    <option key={r.regionCode} value={r.regionCode}>
                      {r.name} ({r.regionCode})
                    </option>
                  ))}
                </select>
                {primary && (
                  <p className="primary-picker__current">
                    Selected: <strong>{primary.name}</strong>
                  </p>
                )}
              </section>

              <RegionFilters
                regions={allRegions}
                filters={filters}
                onChange={setFilters}
                matchCount={visibleRegions.length}
              />

              {visibleRegions.length === 0 && (
                <p className="app__empty" role="status">
                  No Regions match the current filters. Adjust or clear them to
                  see Regions again.
                </p>
              )}

              <ComparisonPanel
                primary={primary}
                visibleRegions={visibleRegions}
                secondaryCodes={secondaryCodes}
                rankedCandidates={rankedCandidates}
                onToggleSecondary={toggleSecondary}
                onClear={clearSelection}
              />

              <ExplainerPanel />
            </aside>
          </main>
        </>
      )}

      <footer className="app__footer">
        <small>
          AWS Builder Center “Map It” hackathon · static SPA · markers are
          approximate regional centroids, not datacenter locations.
        </small>
      </footer>
    </div>
  );
}
