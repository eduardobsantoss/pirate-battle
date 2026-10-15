import { useId, useState, type FormEvent } from 'react';
import { OPTION_LIMITS, type PlayerOptions } from '../../game/config';
import { iconUrl } from '../assetUrls';
import { LIMITS, validateOption } from './validation';

type Field = keyof PlayerOptions;

const FIELDS: { key: Field; label: string; unit: string; hint: string }[] = [
  {
    key: 'sessionDurationSec',
    label: 'Game session time',
    unit: 'seconds',
    hint: `Between ${OPTION_LIMITS.sessionDurationSec.min} and ${OPTION_LIMITS.sessionDurationSec.max} seconds of active play.`,
  },
  {
    key: 'spawnIntervalSec',
    label: 'Enemy spawn time',
    unit: 'seconds',
    hint: `A new enemy every ${OPTION_LIMITS.spawnIntervalSec.min}–${OPTION_LIMITS.spawnIntervalSec.max} seconds (steps of ${OPTION_LIMITS.spawnIntervalSec.step}s).`,
  },
];

export function OptionsScreen({
  options,
  onSave,
  onBack,
}: {
  options: PlayerOptions;
  onSave: (options: PlayerOptions) => void;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<Field, string>>({
    sessionDurationSec: String(options.sessionDurationSec),
    spawnIntervalSec: String(options.spawnIntervalSec),
  });
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const baseId = useId();

  const errors: Record<Field, string | null> = {
    sessionDurationSec: validateOption('sessionDurationSec', values.sessionDurationSec),
    spawnIntervalSec: validateOption('spawnIntervalSec', values.spawnIntervalSec),
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const change = (key: Field, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  const nudge = (key: Field, dir: 1 | -1) => {
    const { min, max, step } = LIMITS[key];
    const current = Number(values[key]);
    const base = Number.isFinite(current) ? current : min;
    const next = Math.min(max, Math.max(min, Math.round((base + dir * step) / step) * step));
    change(key, String(Number(next.toFixed(2))));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) {
      const firstInvalid = FIELDS.find((f) => errors[f.key]);
      if (firstInvalid) document.getElementById(`${baseId}-${firstInvalid.key}`)?.focus();
      return;
    }
    onSave({
      sessionDurationSec: Number(values.sessionDurationSec),
      spawnIntervalSec: Number(values.spawnIntervalSec),
    });
    setSaved(true);
  };

  return (
    <div className="screen screen--center" data-testid="options-screen">
      <form className="panel" onSubmit={submit} noValidate aria-labelledby={`${baseId}-title`}>
        <h1 id={`${baseId}-title`} className="panel__title">
          Options
        </h1>
        <p className="panel__subtitle">Changes apply to the next match you start.</p>

        {FIELDS.map((f) => {
          const id = `${baseId}-${f.key}`;
          const error = touched || values[f.key] !== String(options[f.key]) ? errors[f.key] : null;
          return (
            <div className="field" key={f.key}>
              <label htmlFor={id}>
                {f.label} ({f.unit})
              </label>
              <div className="field__control">
                <button
                  type="button"
                  className="round-button"
                  aria-label={`Decrease ${f.label}`}
                  onClick={() => nudge(f.key, -1)}
                >
                  <span className="round-button__icon" style={{ backgroundImage: `url(${iconUrl('icon_minus')})` }} />
                </button>
                <input
                  id={id}
                  name={f.key}
                  type="number"
                  inputMode="decimal"
                  min={LIMITS[f.key].min}
                  max={LIMITS[f.key].max}
                  step={LIMITS[f.key].step}
                  value={values[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
                  data-testid={`option-${f.key}`}
                />
                <button
                  type="button"
                  className="round-button"
                  aria-label={`Increase ${f.label}`}
                  onClick={() => nudge(f.key, 1)}
                >
                  <span className="round-button__icon" style={{ backgroundImage: `url(${iconUrl('icon_plus')})` }} />
                </button>
              </div>
              <span id={`${id}-hint`} className="field__hint">
                {f.hint}
              </span>
              {error && (
                <span id={`${id}-error`} className="error-text" role="alert" data-testid={`error-${f.key}`}>
                  {error}
                </span>
              )}
            </div>
          );
        })}

        <p role="status" className="success-text" data-testid="options-status">
          {saved ? 'Options saved.' : ''}
        </p>
        <div className="panel__actions">
          <button type="submit" className="btn btn--primary" data-testid="options-save">
            Save
          </button>
          <button type="button" className="btn btn--secondary" onClick={onBack} data-testid="options-back">
            Back
          </button>
        </div>
      </form>
    </div>
  );
}
