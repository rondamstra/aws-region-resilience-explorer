/**
 * DR comparison panel (Features 2–4, ARCHITECTURE.md §9).
 *
 * Shows the selected primary, lets the user pick/deselect secondary candidates
 * from the visible Regions, and renders a ranked list of candidates by
 * APPROXIMATE GREAT-CIRCLE SEPARATION (ascending). Distances are always labeled
 * "approximate great-circle separation" — never latency.
 */
import type { Region } from '../data/types';
import {
  formatSeparationKm,
  type RankedCandidate,
} from '../hooks/useRegionExplorer';

interface ComparisonPanelProps {
  primary: Region | null;
  visibleRegions: Region[];
  secondaryCodes: string[];
  rankedCandidates: RankedCandidate[];
  onToggleSecondary: (code: string) => void;
  onClear: () => void;
}

export default function ComparisonPanel({
  primary,
  visibleRegions,
  secondaryCodes,
  rankedCandidates,
  onToggleSecondary,
  onClear,
}: ComparisonPanelProps) {
  const candidates = visibleRegions.filter(
    (r) => primary && r.regionCode !== primary.regionCode,
  );

  return (
    <section className="compare" aria-labelledby="compare-heading">
      <div className="compare__header">
        <h2 id="compare-heading" className="compare__heading">
          Compare DR candidates
        </h2>
        {(primary || secondaryCodes.length > 0) && (
          <button type="button" className="compare__clear" onClick={onClear}>
            Reset
          </button>
        )}
      </div>

      {!primary && (
        <p className="compare__hint">
          Select a <strong>primary</strong> Region (click a marker or use the
          list) to start comparing secondary candidates.
        </p>
      )}

      {primary && (
        <>
          <p className="compare__primary" data-testid="primary-summary">
            Primary: <strong>{primary.name}</strong>{' '}
            <span className="compare__code">{primary.regionCode}</span>
          </p>

          <fieldset className="compare__candidates">
            <legend>Add secondary candidates</legend>
            <ul className="compare__candidate-list">
              {candidates.map((r) => {
                const checked = secondaryCodes.includes(r.regionCode);
                return (
                  <li key={r.regionCode}>
                    <label className="compare__candidate">
                      <input
                        type="checkbox"
                        checked={checked}
                        data-testid={`candidate-${r.regionCode}`}
                        onChange={() => onToggleSecondary(r.regionCode)}
                      />
                      <span>
                        {r.name}{' '}
                        <span className="compare__code">{r.regionCode}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {candidates.length === 0 && (
                <li className="compare__empty">
                  No other Regions match the current filters.
                </li>
              )}
            </ul>
          </fieldset>

          <div className="compare__ranked">
            <h3 className="compare__ranked-heading">
              Ranked by approximate great-circle separation
            </h3>
            {rankedCandidates.length === 0 ? (
              <p className="compare__hint">
                Pick one or more secondary candidates above to rank them by
                approximate great-circle separation.
              </p>
            ) : (
              <ol className="compare__ranked-list" data-testid="dr-ranked-list">
                {rankedCandidates.map((c, i) => (
                  <li key={c.region.regionCode} data-code={c.region.regionCode}>
                    <span className="compare__rank" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="compare__ranked-name">
                      {c.region.name}{' '}
                      <span className="compare__code">{c.region.regionCode}</span>
                    </span>
                    <span className="compare__distance">
                      {formatSeparationKm(c.separationKm)}
                      <span className="compare__distance-label">
                        {' '}
                        approximate great-circle separation
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
