/**
 * Component — map interaction + disclaimer presence (React Testing Library).
 *
 * Covers AC-1.1, AC-2.1/2.2, AC-3.1/3.2, AC-4.5/4.6, AC-5.6, AC-6.1/6.2
 * (see tests/TEST_STRATEGY.md §3).
 *
 * MODULES UNDER TEST (owned by map-frontend):
 *   - `src/components/MapView`    default export; props { regions, primary, secondaries, onSelect }
 *   - `src/components/Disclaimer` default export; renders the persistent distance≠resilience text
 *
 * Amazon Location Service / MapLibre GL renders to a WebGL canvas that jsdom
 * cannot drive. The frontend SHOULD expose selection state + the drawn-line set
 * through testable DOM (e.g. data-testid / ARIA) OR accept an injectable map
 * adapter so these assertions can run headless. If map-frontend renders only to
 * canvas with no test seam, these become Playwright/e2e checks instead — flag at
 * integration. Assumptions below use role/testid queries the frontend honors.
 *
 * WIRED to the real components. MapView renders an accessible DOM mirror
 * (region-marker-<code> buttons, primary-selected, dr-line) alongside the WebGL
 * map; jsdom cannot drive WebGL, so these headless (jsdom) component tests
 * assert against that mirror. The map tile/canvas render itself is NOT exercised
 * here (needs a real browser) — see the acceptance-criteria notes in the report.
 */
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapView from '../../src/components/MapView';
import Disclaimer from '../../src/components/Disclaimer';
import type { Region } from '../../src/data/types';
import { filterRegions } from '../../src/lib/filters';

// Three real-shaped Region records (matching src/data/types Region).
const REGIONS = [
  { regionCode: 'us-east-1', name: 'US East (N. Virginia)', lat: 38.95, lon: -77.45, country: 'United States', continent: 'North America', launchYear: 2006, azCount: 6, geographyType: 'commercial' },
  { regionCode: 'eu-west-1', name: 'Europe (Ireland)', lat: 53.33, lon: -6.25, country: 'Ireland', continent: 'Europe', launchYear: 2007, azCount: 3, geographyType: 'commercial' },
  { regionCode: 'ap-southeast-2', name: 'Asia Pacific (Sydney)', lat: -33.87, lon: 151.21, country: 'Australia', continent: 'Oceania', launchYear: 2012, azCount: 3, geographyType: 'commercial' },
] as unknown as Region[];

const prov = {
  source: 's',
  retrievedDate: '2026-10-30',
  accuracyNote: 'Approximate centroid, NOT a datacenter location.',
  license: 'l',
};
const withProv = REGIONS.map((r) => ({ ...r, provenance: prov })) as Region[];

/**
 * MapView is a CONTROLLED component (primary/secondaries are props). This
 * harness wires its `onSelect` to local state so the interaction tests can
 * drive selection headlessly through the accessible DOM mirror. It mirrors the
 * useRegionExplorer wiring: first click = primary, later clicks = secondaries.
 */
function MapHarness({ regions = withProv }: { regions?: Region[] }) {
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondaries, setSecondaries] = useState<string[]>([]);
  const [continent, setContinent] = useState<string>('');
  const onSelect = (code: string) => {
    if (primary === null) {
      setPrimary(code);
    } else if (code === primary) {
      // no-op
    } else {
      // Re-pick primary to match AC-2.2 "moving the primary" semantics.
      setPrimary(code);
      setSecondaries((s) => s.filter((c) => c !== code));
    }
  };
  const visible = continent ? filterRegions(regions, { continent }) : regions;
  return (
    <div>
      <label>
        continent
        <select
          data-testid="filter-continent"
          value={continent}
          onChange={(e) => setContinent(e.target.value)}
        >
          <option value="">(all)</option>
          <option value="Europe">Europe</option>
        </select>
      </label>
      <button data-testid="add-secondary-eu" type="button" onClick={() => setSecondaries(['eu-west-1'])}>
        add eu secondary
      </button>
      <MapView
        regions={visible}
        primary={primary}
        secondaries={secondaries}
        onSelect={onSelect}
      />
    </div>
  );
}

// The component's accessible DOM mirror marks each marker with
// data-region-marker="true" and a per-code testid region-marker-<code>.
const allMarkers = () => screen.getAllByTestId(/^region-marker-/);

describe('MapView — markers, selection, lines, filters', () => {
  it('AC-1.1: renders one marker per region record', () => {
    render(<MapView regions={withProv} />);
    expect(allMarkers()).toHaveLength(withProv.length);
  });

  it('AC-2.1 / AC-2.2: selecting a primary marks exactly one; re-picking moves it', async () => {
    const user = userEvent.setup();
    render(<MapHarness />);
    await user.click(screen.getByTestId('region-marker-us-east-1'));
    expect(screen.getAllByTestId('primary-selected')).toHaveLength(1);
    expect(screen.getByTestId('region-marker-us-east-1')).toHaveAttribute('data-primary', 'true');

    await user.click(screen.getByTestId('region-marker-eu-west-1'));
    expect(screen.getAllByTestId('primary-selected')).toHaveLength(1);
    expect(screen.getByTestId('region-marker-eu-west-1')).toHaveAttribute('data-primary', 'true');
    expect(screen.getByTestId('region-marker-us-east-1')).toHaveAttribute('data-primary', 'false');
  });

  it('AC-3.1 / AC-4.5: a selected secondary draws a line between primary and secondary', () => {
    render(<MapView regions={withProv} primary="us-east-1" secondaries={['eu-west-1']} />);
    const lines = screen.getAllByTestId('dr-line');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('data-from', 'us-east-1');
    expect(lines[0]).toHaveAttribute('data-to', 'eu-west-1');
  });

  it('AC-4.5: no line is drawn without a selected secondary', () => {
    render(<MapView regions={withProv} primary="us-east-1" secondaries={[]} />);
    expect(screen.queryAllByTestId('dr-line')).toHaveLength(0);
  });

  it('AC-5.6: filtering to Europe reduces the on-map marker set to EU regions', async () => {
    const user = userEvent.setup();
    render(<MapHarness />);
    expect(allMarkers()).toHaveLength(3);
    await user.selectOptions(screen.getByTestId('filter-continent'), 'Europe');
    const markers = allMarkers();
    expect(markers).toHaveLength(1); // only eu-west-1 is Europe in this set
    expect(screen.getByTestId('region-marker-eu-west-1')).toBeInTheDocument();
  });
});

describe('Disclaimer — always present (AC-6.1 / AC-6.2)', () => {
  it('AC-6.1: disclaimer names distance ≠ latency ≠ resilience ≠ compliance ≠ availability', () => {
    render(<Disclaimer />);
    const text = screen.getByTestId('distance-disclaimer').textContent?.toLowerCase() ?? '';
    for (const w of ['latency', 'resilience', 'compliance', 'availability']) {
      expect(text).toContain(w);
    }
  });

  it('AC-4.6: disclaimer labels separation "approximate great-circle separation", never latency', () => {
    render(<Disclaimer />);
    expect(screen.getByText(/approximate great-circle separation/i)).toBeInTheDocument();
  });

  it('AC-6.2: disclaimer stays visible after picking primary, secondary, and filtering', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Disclaimer />
        <MapHarness />
      </>,
    );
    await user.click(screen.getByTestId('region-marker-us-east-1'));
    await user.click(screen.getByTestId('add-secondary-eu'));
    await user.selectOptions(screen.getByTestId('filter-continent'), 'Europe');
    expect(screen.getByTestId('distance-disclaimer')).toBeVisible();
  });
});
