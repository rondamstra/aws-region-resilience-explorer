/**
 * Interactive map (Features 1–4, ARCHITECTURE.md §1, §4, §9).
 *
 * Renders the 33 commercial AWS Regions as MapLibre GL markers on a no-auth
 * local basemap (see src/config/mapStyle.ts — one-line swap to Amazon Location
 * Service for Phase D), highlights the selected primary distinctly, and draws
 * great-circle connection lines from the primary to each selected secondary.
 *
 * TEST SEAM: Amazon Location Service / MapLibre render to a WebGL canvas that
 * jsdom cannot drive. So alongside the real map, this component renders an
 * accessible, headless-testable DOM mirror:
 *   - one `region-marker` / `region-marker-<code>` element per visible Region
 *     (a real, keyboard-operable button that also selects the primary),
 *   - a `primary-selected` element with `data-primary="true"` on the primary,
 *   - one `dr-line` element per drawn line with `data-from` / `data-to`.
 * This keeps the component headless-testable (tests/component/mapInteraction)
 * without a browser while still driving the live map.
 */
import { useEffect, useRef } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MLMap,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, LineString } from 'geojson';
import type { Region } from '../data/types';
import { resolveMapStyle, isCognitoMapStyle } from '../config/mapStyle';
import { getMapAuthTransformRequest } from '../config/mapAuth';
import { greatCircleArc } from '../data/greatCircle';

export interface MapViewProps {
  /** Visible Regions to render as markers. */
  regions: Region[];
  /** Selected primary Region code, if any. */
  primary?: string | null;
  /** Selected secondary Region codes. */
  secondaries?: string[];
  /** Called when the user activates a marker (selects it as primary). */
  onSelect?: (code: string) => void;
}

const LINE_SOURCE_ID = 'dr-lines';
const LINE_LAYER_ID = 'dr-lines-layer';

/** Build the GeoJSON FeatureCollection of great-circle lines primary→secondary. */
function buildLineFeatures(
  regions: Region[],
  primary: string | null | undefined,
  secondaries: string[] | undefined,
): FeatureCollection<LineString, { from: string; to: string }> {
  const byCode = new Map(regions.map((r) => [r.regionCode, r]));
  const p = primary ? byCode.get(primary) : undefined;
  const features: FeatureCollection<LineString, { from: string; to: string }>['features'] = [];
  if (p && secondaries) {
    for (const code of secondaries) {
      const s = byCode.get(code);
      if (!s) continue;
      features.push({
        type: 'Feature',
        properties: { from: p.regionCode, to: s.regionCode },
        geometry: {
          type: 'LineString',
          coordinates: greatCircleArc(
            { lat: p.lat, lon: p.lon },
            { lat: s.lat, lon: s.lon },
          ),
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export default function MapView({
  regions,
  primary = null,
  secondaries = [],
  onSelect,
}: MapViewProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Initialise the MapLibre map once. Guarded so it is skipped in jsdom (no WebGL).
  //
  // When the Cognito SigV4 path is active (amplify_outputs.json wires a guest
  // identity pool), we must resolve the auth-helper `transformRequest` FIRST —
  // it exchanges anonymous Cognito guest credentials and SigV4-signs every
  // style/tile/glyph/sprite request to *.amazonaws.com. That resolution is
  // async, so map construction is deferred into an async closure with a
  // cancellation guard. On the OSM fallback / API-key paths no transformRequest
  // is needed and the map is built immediately.
  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;
    let cancelled = false;

    const buildMap = (transformRequest?: maplibregl.RequestTransformFunction) => {
      const container = nodeRef.current;
      if (cancelled || !container || mapRef.current) return;
      let map: MLMap;
      try {
        map = new maplibregl.Map({
          container,
          style: resolveMapStyle() as string | StyleSpecification,
          center: [0, 20],
          zoom: 1.3,
          attributionControl: { compact: true },
          // SigV4-sign ALS requests with Cognito guest creds (undefined = no-op).
          ...(transformRequest ? { transformRequest } : {}),
        });
      } catch {
        // No WebGL (e.g. jsdom / headless test): the DOM mirror below still works.
        return;
      }
      map.addControl(new maplibregl.NavigationControl({ showZoom: true }), 'top-right');
      map.on('load', () => {
        readyRef.current = true;
        map.addSource(LINE_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: LINE_SOURCE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#d13438',
            'line-width': 2.5,
            'line-opacity': 0.9,
            'line-dasharray': [2, 1],
          },
        });
        syncLines();
        syncMarkers();
      });
      mapRef.current = map;
    };

    if (isCognitoMapStyle()) {
      // Cognito SigV4: resolve the signing transformRequest, then build. If the
      // credential exchange fails, build without it so the app still renders
      // (unsigned requests simply fail to load tiles rather than crashing).
      getMapAuthTransformRequest()
        .then((tr) => buildMap(tr as maplibregl.RequestTransformFunction | undefined))
        .catch(() => buildMap(undefined));
    } else {
      buildMap(undefined);
    }

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map) {
        map.remove();
        mapRef.current = null;
      }
      readyRef.current = false;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep DOM markers on the live map in sync with the visible Regions + selection.
  function syncMarkers() {
    const map = mapRef.current;
    if (!map) return;
    const existing = markersRef.current;
    const wanted = new Set(regions.map((r) => r.regionCode));

    // Remove markers no longer visible.
    for (const [code, marker] of existing) {
      if (!wanted.has(code)) {
        marker.remove();
        existing.delete(code);
      }
    }

    for (const r of regions) {
      const isPrimary = r.regionCode === primary;
      const isSecondary = secondaries.includes(r.regionCode);
      let marker = existing.get(r.regionCode);
      if (!marker) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'map-marker';
        el.setAttribute('aria-label', `${r.name} (${r.regionCode})`);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current?.(r.regionCode);
        });
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([r.lon, r.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 16, closeButton: false }).setText(
              `${r.name} — ${r.regionCode}`,
            ),
          )
          .addTo(map);
        existing.set(r.regionCode, marker);
      }
      const el = marker.getElement();
      el.classList.toggle('map-marker--primary', isPrimary);
      el.classList.toggle('map-marker--secondary', isSecondary && !isPrimary);
    }
  }

  function syncLines() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource(LINE_SOURCE_ID) as GeoJSONSource | undefined;
    if (src) src.setData(buildLineFeatures(regions, primary, secondaries));
  }

  useEffect(() => {
    if (readyRef.current) {
      syncMarkers();
      syncLines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, primary, secondaries]);

  const lineFeatures = buildLineFeatures(regions, primary, secondaries).features;

  return (
    <div className="map" aria-label="AWS Regions map">
      <div ref={nodeRef} className="map__canvas" data-testid="map-canvas" />

      {/*
        Accessible, headless-testable DOM mirror of the map state. Screen-reader
        users get a keyboard-operable Region list; tests get stable seams. The
        live WebGL markers above mirror the same selection.
      */}
      <div className="map__a11y" data-testid="map-a11y">
        <h2 className="sr-only">AWS Regions</h2>
        <ul className="map__marker-list">
          {regions.map((r) => {
            const isPrimary = r.regionCode === primary;
            return (
              <li key={r.regionCode}>
                <button
                  type="button"
                  className="map__marker-item"
                  data-testid={`region-marker-${r.regionCode}`}
                  data-region-marker="true"
                  data-primary={isPrimary ? 'true' : 'false'}
                  aria-pressed={isPrimary}
                  onClick={() => onSelect?.(r.regionCode)}
                >
                  <span className="map__marker-name">{r.name}</span>{' '}
                  <span className="map__marker-code">{r.regionCode}</span>
                  {isPrimary && (
                    <span data-testid="primary-selected" data-primary="true" className="sr-only">
                      primary selected
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Hidden mirror of each drawn line for headless assertions. */}
        <ul className="sr-only" aria-hidden="true">
          {lineFeatures.map((f) => (
            <li
              key={`${f.properties.from}->${f.properties.to}`}
              data-testid="dr-line"
              data-from={f.properties.from}
              data-to={f.properties.to}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
