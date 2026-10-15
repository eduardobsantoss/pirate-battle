import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { submissions } from '../api/submissions';
import { resetDb } from '../mocks/db';
import {
  getAssetFailure,
  getScenario,
  isScenario,
  SCENARIOS,
  setAssetFailure,
  setScenario,
  type ScenarioId,
} from '../mocks/scenarios';

/**
 * Demo/testing panel to pick the mocked network scenario and reset the mock
 * backend. Kept outside gameplay so it never captures game input.
 */
export function NetworkPanel() {
  const [open, setOpen] = useState(false);
  const [scenario, setLocalScenario] = useState<ScenarioId>(getScenario);
  const [failAssets, setFailAssets] = useState(() => getAssetFailure() !== null);
  const queryClient = useQueryClient();

  const change = (id: ScenarioId) => {
    setScenario(id);
    setLocalScenario(id);
    void queryClient.invalidateQueries();
  };

  const toggleAssets = (on: boolean) => {
    // Fails one ship texture: enough to block the match and show the retry flow.
    setAssetFailure(on ? 'ship_' : null);
    setFailAssets(on);
  };

  const reset = () => {
    toggleAssets(false);
    resetDb();
    submissions.clear();
    change('success');
    queryClient.clear();
  };

  return (
    <aside className="network-panel" aria-label="Mock network settings">
      <button
        type="button"
        className="btn btn--secondary btn--small"
        aria-expanded={open}
        aria-controls="network-panel-body"
        onClick={() => setOpen((o) => !o)}
        data-testid="network-toggle"
      >
        Network: {scenario}
      </button>
      {open && (
        <div id="network-panel-body" className="network-panel__body">
          <label htmlFor="scenario-select">Mock API scenario</label>
          <select
            id="scenario-select"
            value={scenario}
            onChange={(e) => isScenario(e.target.value) && change(e.target.value)}
            data-testid="scenario-select"
          >
            {Object.entries(SCENARIOS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={failAssets}
              onChange={(e) => toggleAssets(e.target.checked)}
              data-testid="fail-assets"
            />{' '}
            Fail game asset loading
          </label>
          <button type="button" className="link-button" onClick={reset} data-testid="network-reset">
            Reset mock data &amp; scenario
          </button>
        </div>
      )}
    </aside>
  );
}
