import { useEffect, useState } from 'react';
import { loadRegions } from './data/loadRegions';
import type { Region } from './data/types';
import { MapContainer } from './components/MapContainer';
import './App.css';

/**
 * App shell for the AWS Region Resilience Explorer.
 *
 * SCAFFOLD PHASE: this renders the layout, loads + validates the Region dataset
 * (schemaVersion === 1), and shows a placeholder map container. The real map
 * (Amazon Location Service via MapLibre), filters, primary/secondary selection
 * and distance drawing are built in later phases (ARCHITECTURE.md §1, §9).
 */
export default function App() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [usedFixture, setUsedFixture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadRegions()
      .then(({ dataset, usedFixture }) => {
        if (cancelled) return;
        setRegions(dataset.regions);
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

  return (
    <div className="app">
      <header className="app__header">
        <h1>AWS Region Resilience Explorer</h1>
        <p className="app__tagline">
          Approximate great-circle separation between AWS Regions for DR
          reasoning.
        </p>
      </header>

      {/* Distance ≠ resilience: first-class disclaimer (ARCHITECTURE.md §9). */}
      <aside className="app__disclaimer" role="note">
        <strong>Heads up:</strong> markers are <em>approximate regional
        centroids</em>, not datacenter locations. Great-circle distance is a
        geometric proxy only — it is <em>not</em> network latency, fault
        isolation, service availability, or compliance.
      </aside>

      <main className="app__main">
        <MapContainer />

        <section className="app__status" aria-live="polite">
          {loading && <p>Loading Region dataset…</p>}
          {error && <p className="app__error">Failed to load dataset: {error}</p>}
          {!loading && !error && (
            <p>
              Loaded <strong>{regions.length}</strong> Region
              {regions.length === 1 ? '' : 's'}
              {usedFixture && (
                <>
                  {' '}
                  <span className="app__badge">
                    sample fixture (real dataset not found)
                  </span>
                </>
              )}
              .
            </p>
          )}
        </section>
      </main>

      <footer className="app__footer">
        <small>
          AWS Builder Center “Map It” hackathon · scaffold phase · no AWS
          resources deployed.
        </small>
      </footer>
    </div>
  );
}
