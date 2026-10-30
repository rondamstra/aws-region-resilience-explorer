/**
 * Short explainer: how to ACTUALLY reason about a DR secondary Region
 * (Feature 6 / creativity criterion, ARCHITECTURE.md §9 + §10).
 *
 * Reframes "distance" into an honest DR-reasoning aid: it tells the user what
 * the map is a useful proxy for, and what they must check elsewhere.
 */
import { useState } from 'react';

export default function ExplainerPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="explainer" aria-labelledby="explainer-heading">
      <button
        type="button"
        className="explainer__toggle"
        aria-expanded={open}
        aria-controls="explainer-body"
        onClick={() => setOpen((v) => !v)}
      >
        <span id="explainer-heading">How to actually pick a DR Region</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div id="explainer-body" className="explainer__body">
          <p>
            Geographic separation reduces the chance that one physical event (a
            storm, a grid or flood event, a regional natural disaster) hits both
            Regions at once. That is the <em>one</em> thing this map helps with.
            It is a starting filter, not the decision.
          </p>
          <p>Before you commit a secondary Region, check the things distance can’t tell you:</p>
          <ul>
            <li>
              <strong>Service + feature parity.</strong> Confirm every service,
              feature and instance type you depend on exists in the candidate
              Region.
            </li>
            <li>
              <strong>Data residency &amp; compliance.</strong> Legal/contractual
              constraints can rule out a Region regardless of how far it is.
            </li>
            <li>
              <strong>Latency &amp; replication.</strong> Measure real RTT and
              replication lag on your actual network paths — distance is a poor
              predictor of either.
            </li>
            <li>
              <strong>Blast radius &amp; correlation.</strong> Shared
              dependencies, provider-side control planes and account-level limits
              can correlate failures that look independent on a map.
            </li>
            <li>
              <strong>Cost &amp; operations.</strong> Cross-Region data transfer,
              duplicated capacity and the team’s ability to operate a second
              Region all matter.
            </li>
          </ul>
          <p className="explainer__footnote">
            Use the ranked separation list to shortlist candidates, then validate
            each against the above.
          </p>
        </div>
      )}
    </section>
  );
}
