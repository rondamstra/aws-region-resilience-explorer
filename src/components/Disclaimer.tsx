/**
 * Persistent, first-class disclaimer (Feature 6, ARCHITECTURE.md §9).
 *
 * This is not fine print: it is always visible and states plainly that
 * great-circle separation is NOT latency, NOT resilience / fault isolation,
 * NOT service availability and NOT compliance, and that markers are approximate
 * regional centroids rather than datacenter locations.
 *
 * The component names all four conflated concepts (latency, resilience,
 * compliance, availability) so the product cannot mislabel distance.
 */
export default function Disclaimer() {
  return (
    <aside
      className="disclaimer"
      role="note"
      aria-label="Important: what this map does and does not show"
      data-testid="distance-disclaimer"
    >
      <p className="disclaimer__lead">
        <strong>Distance is not resilience.</strong> This map shows{' '}
        <em>approximate great-circle separation</em> between approximate regional
        centroids — a geometric proxy only.
      </p>
      <p className="disclaimer__body">
        Separation is <strong>not</strong> network <strong>latency</strong>,{' '}
        <strong>not</strong> fault isolation or true <strong>resilience</strong>,{' '}
        <strong>not</strong> service <strong>availability</strong>, and{' '}
        <strong>not</strong> data-residency <strong>compliance</strong>. Markers
        are approximate region-city centroids, <strong>not</strong> AWS
        datacenter locations.
      </p>
    </aside>
  );
}
