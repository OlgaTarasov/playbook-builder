import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as actionsApi from '../api/actionsApi';
import * as playbooksApi from '../api/playbooksApi';
import * as triggersApi from '../api/triggersApi';
import { ApiError } from '../api/apiClient';
import type { ActionDto, PlaybookDto, TriggerDto } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { FormField } from '../components/FormField';
import { TriggerPicker } from '../components/TriggerPicker';
import { MESSAGES } from '../validation/messages';
import { validateActions, validatePlaybookName, validateTrigger, ACTIONS_MAX } from '../validation/rules';
import { mapDetailsToFields, messageFromError } from '../validation/serverErrors';

interface FieldErrors {
  name?: string;
  triggerId?: string;
  actionIds?: string;
}

const FORM_FIELDS = ['name', 'triggerId', 'actionIds'] as const;

export function CreatePlaybookPage() {
  const [loading, setLoading] = useState(true);
  const [triggers, setTriggers] = useState<TriggerDto[]>([]);
  const [actions, setActions] = useState<ActionDto[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookDto[]>([]);

  const [name, setName] = useState('');
  const [triggerId, setTriggerId] = useState('');
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(() => new Set());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard against a second click before React re-renders the disabled button.
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([triggersApi.listAdded(), actionsApi.list(), playbooksApi.list()])
      .then(([loadedTriggers, loadedActions, loadedPlaybooks]) => {
        if (cancelled) return;
        setTriggers(loadedTriggers);
        setActions(loadedActions);
        setPlaybooks(loadedPlaybooks);
      })
      .catch((err: unknown) => {
        if (!cancelled) setBanner(messageFromError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Reloads the user's triggers. Keeps the current selection if it still exists. */
  async function reloadTriggers(selectId?: string) {
    try {
      const list = await triggersApi.listAdded();
      setTriggers(list);
      if (selectId) {
        setTriggerId(selectId);
      } else {
        setTriggerId((prev) => (list.some((t) => t.id === prev) ? prev : ''));
      }
    } catch (err) {
      setBanner(messageFromError(err));
    }
  }

  function toggleAction(actionId: string, checked: boolean) {
    setFieldErrors((prev) => ({ ...prev, actionIds: undefined }));
    setSelectedActionIds((prev) => {
      if (checked && prev.size >= ACTIONS_MAX) return prev;
      const next = new Set(prev);
      if (checked) {
        next.add(actionId);
      } else {
        next.delete(actionId);
      }
      return next;
    });
  }

  function resetForm() {
    setName('');
    setTriggerId('');
    setSelectedActionIds(new Set());
    setFieldErrors({});
  }

  function handleCreateError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.code === 'VALIDATION_ERROR' && err.details.length > 0) {
        const mapped = mapDetailsToFields(err.details, FORM_FIELDS);
        setFieldErrors(mapped.fieldErrors);
        if (mapped.unmatched.length > 0) setBanner(mapped.unmatched[0]);
        return;
      }
      if (err.code === 'TRIGGER_NOT_ADDED') {
        setBanner(MESSAGES.triggerNotAdded);
        void reloadTriggers();
        return;
      }
      if (err.code === 'PLAYBOOK_NAME_TAKEN') {
        setFieldErrors({ name: MESSAGES.playbookNameTaken });
        return;
      }
    }
    setBanner(messageFromError(err));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    setBanner(null);
    // Catalogue order, as the spec requires.
    const actionIds = actions.filter((a) => selectedActionIds.has(a.id)).map((a) => a.id);
    const errors: FieldErrors = {
      name: validatePlaybookName(name),
      triggerId: validateTrigger(triggerId),
      actionIds: validateActions(actionIds),
    };
    setFieldErrors(errors);
    if (errors.name || errors.triggerId || errors.actionIds) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const created = await playbooksApi.create({
        name: name.trim(),
        triggerId,
        actionIds,
      });
      setPlaybooks((prev) => [...prev, created]);
      resetForm();
    } catch (err) {
      handleCreateError(err);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleDelete(playbook: PlaybookDto) {
    if (!window.confirm(`Delete playbook "${playbook.name}"?`)) return;
    setBanner(null);
    try {
      await playbooksApi.remove(playbook.id);
      setPlaybooks((prev) => prev.filter((p) => p.id !== playbook.id));
    } catch (err) {
      setBanner(messageFromError(err));
    }
  }

  const atActionLimit = selectedActionIds.size >= ACTIONS_MAX;

  return (
    <div className="page-fill">
      <h1 className="page-title">Create Playbook</h1>
      <ErrorBanner message={banner} />
      <div className="page-columns">
        <section className="card card--fill" aria-labelledby="new-playbook-title">
          <header className="card__header">
            <h2 className="card__title" id="new-playbook-title">
              New playbook
            </h2>
          </header>
          <div className="card__body">
            <form noValidate onSubmit={handleCreate}>
              <FormField
                label="Name"
                id="playbook-name"
                type="text"
                autoComplete="off"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                error={fieldErrors.name}
              />
              <TriggerPicker
                triggers={triggers}
                value={triggerId}
                onChange={(id) => {
                  setTriggerId(id);
                  setFieldErrors((prev) => ({ ...prev, triggerId: undefined }));
                }}
                onAdded={(trigger) => void reloadTriggers(trigger.id)}
                onError={(err) => setBanner(messageFromError(err))}
                disabled={submitting}
                error={fieldErrors.triggerId}
              />
              <fieldset className="checkbox-group">
                <legend className="form-field__label">Actions</legend>
                <p className="form-field__hint">(Choose up to 3)</p>
                {actions.map((action) => {
                  const checked = selectedActionIds.has(action.id);
                  return (
                    <label key={action.id} className="checkbox-group__item">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && atActionLimit}
                        onChange={(e) => toggleAction(action.id, e.target.checked)}
                      />
                      {action.name}
                    </label>
                  );
                })}
                {fieldErrors.actionIds && (
                  <div className="form-field__error">{fieldErrors.actionIds}</div>
                )}
              </fieldset>
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={submitting || triggers.length === 0}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="card card--fill" aria-labelledby="your-playbooks-title">
          <header className="card__header">
            <h2 className="card__title" id="your-playbooks-title">
              Your playbooks
            </h2>
          </header>
          <div className="card__body card__body--scroll">
            {loading ? (
              <p className="empty-state">Loading…</p>
            ) : playbooks.length === 0 ? (
              <p className="empty-state">{MESSAGES.noPlaybooks}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr className="table__head">
                    <th scope="col">Name</th>
                    <th scope="col">Trigger</th>
                    <th scope="col">Action list</th>
                    <th scope="col">
                      <span className="visually-hidden">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {playbooks.map((playbook) => (
                    <tr key={playbook.id} className="table__row">
                      <td>{playbook.name}</td>
                      <td>{playbook.trigger.name}</td>
                      <td>{playbook.actions.map((a) => a.name).join(', ')}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--link table__action"
                          aria-label={`Delete playbook ${playbook.name}`}
                          onClick={() => handleDelete(playbook)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
