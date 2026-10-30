import { useRef } from 'react';
import './MapContainer.css';

/**
 * Placeholder map container.
 *
 * SCAFFOLD PHASE: this reserves the DOM node the map will mount into. A later
 * phase initialises MapLibre GL JS against the Amazon Location Service basemap
 * using the restricted API key from the generated Amplify config
 * (ARCHITECTURE.md §4). No map SDK is initialised yet.
 */
export function MapContainer() {
  // Ref the real map instance will attach to later.
  const mapNodeRef = useRef<HTMLDivElement>(null);

  return (
    <div className="map" aria-label="AWS Regions map (placeholder)">
      <div ref={mapNodeRef} className="map__canvas">
        <div className="map__placeholder">
          <p className="map__placeholder-title">Map placeholder</p>
          <p className="map__placeholder-sub">
            Amazon Location Service basemap mounts here in a later phase.
          </p>
        </div>
      </div>
    </div>
  );
}
