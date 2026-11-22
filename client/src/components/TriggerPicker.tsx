import { useEffect, useState } from 'react';
import * as triggersApi from '../api/triggersApi';
import { ApiError } from '../api/apiClient';
import type { TriggerDto } from '../api/types';
import { MESSAGES } from '../validation/messages';
import { messageFromError } from '../validation/serverErrors';

interface TriggerPickerProps {
  triggers: TriggerDto[];
  value: string;
  onChange: (triggerId: string) => void;
  /** Called with the trigger the user just added. The parent reloads and selects it. */
  onAdded: (trigger: TriggerDto) => void;
  /** Receives add failures other than TRIGGER_ALREADY_ADDED, so the parent can show a banner. */
  onError?: (error: unknown) => void;
  disabled?: boolean;
  error?: string;
}

export function TriggerPicker({
  triggers,
  value,
  onChange,
  onAdded,
  onError,
  disabled,
  error,
}: TriggerPickerProps) {
  const [open, setOpen] = useState(false);
  // null while loading or after a failed load.
  const [available, setAvailable] = useState<TriggerDto[] | null>(null);
  const [pickId, setPickId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const noTriggers = triggers.length === 0;
  // True once the server reports nothing is left to add; hides the Add Trigger button.
  const allAdded = available !== null && available.length === 0;

  // Check availability up front, and again whenever the user's list changes.
  useEffect(() => {
    let cancelled = false;
    triggersApi
      .listAvailable()
      .then((list) => {
        if (!cancelled) setAvailable(list);
      })
      .catch(() => {
        // Leave the button visible; opening the panel shows the error.
      });
    return () => {
      cancelled = true;
    };
  }, [triggers]);

  async function loadAvailable() {
    setAvailable(null);
    setPickId('');
    try {
      setAvailable(await triggersApi.listAvailable());
    } catch (err) {
      setAddError(messageFromError(err));
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    setAddError(null);
    if (next) {
      await loadAvailable();
    }
  }

  async function handleAdd() {
    if (!pickId || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const trigger = await triggersApi.add(pickId);
      setOpen(false);
      onAdded(trigger);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TRIGGER_ALREADY_ADDED') {
        setAddError(MESSAGES.triggerAlreadyAdded);
        await loadAvailable();
      } else if (onError) {
        onError(err);
      } else {
        setAddError(messageFromError(err));
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="trigger-picker">
      <div className="form-field">
        <label className="form-field__label" htmlFor="trigger">
          Trigger
        </label>
        <div className="trigger-picker__row">
          <select
            id="trigger"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || noTriggers}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'trigger-error' : undefined}
          >
            {noTriggers ? (
              <option value="" disabled>
                {MESSAGES.noTriggersAdded}
              </option>
            ) : (
              <>
                <option value="" disabled>
                  {MESSAGES.selectTrigger}
                </option>
                {triggers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </>
            )}
          </select>
          {!allAdded && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={toggle}
              aria-expanded={open}
              aria-controls="add-trigger-panel"
            >
              Add Trigger
            </button>
          )}
        </div>
        {noTriggers && (
          <p className="form-field__hint" id="trigger-empty-hint">
            {MESSAGES.noTriggersCreateHint}
          </p>
        )}
        {error && (
          <div className="form-field__error" id="trigger-error">
            {error}
          </div>
        )}
      </div>

      {open && !allAdded && (
        <div className="trigger-picker__panel" id="add-trigger-panel">
          {available === null && !addError && <p className="form-field__hint">Loading triggers…</p>}
          {available !== null && available.length > 0 && (
            <div className="trigger-picker__row">
              <select
                aria-label="Available triggers"
                value={pickId}
                onChange={(e) => setPickId(e.target.value)}
              >
                <option value="" disabled>
                  Choose a trigger to add
                </option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleAdd}
                disabled={!pickId || adding}
              >
                Add
              </button>
            </div>
          )}
          {addError && <div className="form-field__error">{addError}</div>}
        </div>
      )}
    </div>
  );
}
