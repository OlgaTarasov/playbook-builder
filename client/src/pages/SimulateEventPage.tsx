import { useEffect, useRef, useState } from 'react';
import * as simulationApi from '../api/simulationApi';
import * as triggersApi from '../api/triggersApi';
import { ApiError } from '../api/apiClient';
import type { SimulationDto, TriggerDto } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { MESSAGES } from '../validation/messages';
import { validateTrigger } from '../validation/rules';
import { messageFromError } from '../validation/serverErrors';

export function SimulateEventPage() {
  const [triggers, setTriggers] = useState<TriggerDto[]>([]);
  const [triggerId, setTriggerId] = useState('');
  // null until the first run; each successful run replaces it.
  const [results, setResults] = useState<SimulationDto | null>(null);
  // Name of the trigger that produced `results`, captured at run time.
  const [resultTriggerName, setResultTriggerName] = useState('');
  const [triggerError, setTriggerError] = useState<string | undefined>(undefined);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    triggersApi
      .listAdded()
      .then((list) => {
        if (!cancelled) setTriggers(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setBanner(messageFromError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRun() {
    if (submittingRef.current) return;

    setBanner(null);
    const error = validateTrigger(triggerId);
    setTriggerError(error);
    if (error) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const name = triggers.find((t) => t.id === triggerId)?.name ?? '';
      setResults(await simulationApi.run(triggerId));
      setResultTriggerName(name);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TRIGGER_NOT_ADDED') {
        setBanner(MESSAGES.triggerNotAdded);
      } else {
        setBanner(messageFromError(err));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="page-fill">
      <h1 className="page-title">Simulate Event</h1>
      <ErrorBanner message={banner} />

      <section className="card" aria-labelledby="run-simulation-title">
        <header className="card__header">
          <h2 className="card__title" id="run-simulation-title">
            Run simulation
          </h2>
        </header>
        <div className="card__body">
          <div className="form-field">
            <label className="form-field__label" htmlFor="simulate-trigger">
              Trigger
            </label>
            <select
              id="simulate-trigger"
              value={triggerId}
              onChange={(e) => {
                setTriggerId(e.target.value);
                setTriggerError(undefined);
              }}
              disabled={submitting || triggers.length === 0}
              aria-invalid={triggerError ? true : undefined}
              aria-describedby={triggerError ? 'simulate-trigger-error' : undefined}
            >
              {triggers.length === 0 ? (
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
            {triggers.length === 0 && (
              <p className="form-field__hint" id="simulate-trigger-empty-hint">
                {MESSAGES.noTriggersSimulateHint}
              </p>
            )}
            {triggerError && (
              <div className="form-field__error" id="simulate-trigger-error">
                {triggerError}
              </div>
            )}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleRun}
              disabled={submitting || triggers.length === 0}
            >
              Run Simulation
            </button>
          </div>
        </div>
      </section>

      <section className="card card--fill card--grow" aria-labelledby="matching-playbooks-title">
        <header className="card__header">
          <h2 className="card__title" id="matching-playbooks-title">
            Matching Playbooks
          </h2>
        </header>
        <div className="card__body card__body--scroll">
          {results && <p className="results__title">{`Trigger: ${resultTriggerName}`}</p>}
          {results &&
            (results.matches.length === 0 ? (
              <p className="empty-state">{MESSAGES.noMatches}</p>
            ) : (
              <div className="results">
                {results.matches.map((match) => (
                  <div className="results__match" key={match.playbook.id}>
                    <div className="results__title">{`Playbook: ${match.playbook.name}`}</div>
                    <ul>
                      {match.actions.map((action) => (
                        <li className="results__action" key={action.id}>
                          {`→ ${action.name}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
