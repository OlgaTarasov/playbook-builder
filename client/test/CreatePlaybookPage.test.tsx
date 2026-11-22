import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/apiClient';
import * as actionsApi from '../src/api/actionsApi';
import * as playbooksApi from '../src/api/playbooksApi';
import * as triggersApi from '../src/api/triggersApi';
import type { ActionDto, PlaybookDto, TriggerDto } from '../src/api/types';
import { CreatePlaybookPage } from '../src/pages/CreatePlaybookPage';
import { renderWithProviders } from './helpers/renderWithProviders';

vi.mock('../src/api/triggersApi', () => ({
  listAdded: vi.fn(),
  listAvailable: vi.fn(),
  add: vi.fn(),
}));
vi.mock('../src/api/actionsApi', () => ({ list: vi.fn() }));
vi.mock('../src/api/playbooksApi', () => ({
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

const MALWARE: TriggerDto = { id: 't1', name: 'Malware Detected' };
const LOGIN: TriggerDto = { id: 't2', name: 'Login Attempt' };
const PHISHING: TriggerDto = { id: 't3', name: 'Phishing Alert' };

const ISOLATE: ActionDto = { id: 'a1', name: 'Isolate Host' };
const NOTIFY: ActionDto = { id: 'a2', name: 'Notify Admin' };
const BLOCK: ActionDto = { id: 'a3', name: 'Block IP' };
const QUARANTINE: ActionDto = { id: 'a4', name: 'Quarantine File' };

const ACTIONS = [ISOLATE, NOTIFY, BLOCK, QUARANTINE];

const EXISTING: PlaybookDto = {
  id: 'p1',
  name: 'Critical Response',
  trigger: MALWARE,
  actions: [ISOLATE],
  createdAt: '2026-11-22T10:00:00Z',
};

async function renderPage() {
  const view = renderWithProviders(<CreatePlaybookPage />, { route: '/playbooks' });
  // Wait for the initial load to finish.
  await screen.findByRole('checkbox', { name: 'Isolate Host' });
  return view;
}

describe('CreatePlaybookPage', () => {
  beforeEach(() => {
    vi.mocked(triggersApi.listAdded).mockResolvedValue([MALWARE, LOGIN]);
    vi.mocked(triggersApi.listAvailable).mockResolvedValue([]);
    vi.mocked(triggersApi.add).mockReset();
    vi.mocked(actionsApi.list).mockResolvedValue(ACTIONS);
    vi.mocked(playbooksApi.list).mockResolvedValue([EXISTING]);
    vi.mocked(playbooksApi.create).mockReset();
    vi.mocked(playbooksApi.remove).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates an empty name and a missing trigger without sending a request', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Choose a trigger')).toBeInTheDocument();
    expect(playbooksApi.create).not.toHaveBeenCalled();
  });

  it('requires at least one action', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('Name'), 'Contain');
    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Choose at least one action')).toBeInTheDocument();
    expect(playbooksApi.create).not.toHaveBeenCalled();
  });

  it('allows three actions to be selected', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('checkbox', { name: 'Isolate Host' }));
    await user.click(screen.getByRole('checkbox', { name: 'Notify Admin' }));
    await user.click(screen.getByRole('checkbox', { name: 'Block IP' }));

    expect(screen.getByRole('checkbox', { name: 'Isolate Host' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Notify Admin' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Block IP' })).toBeChecked();
  });

  it('disables the fourth action once three are selected, and re-enables it on uncheck', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('checkbox', { name: 'Isolate Host' }));
    await user.click(screen.getByRole('checkbox', { name: 'Notify Admin' }));
    await user.click(screen.getByRole('checkbox', { name: 'Block IP' }));

    const fourth = screen.getByRole('checkbox', { name: 'Quarantine File' });
    expect(fourth).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Isolate Host' }));
    expect(fourth).toBeEnabled();
  });

  it('sends the actions in catalogue order and resets the form after create', async () => {
    const created: PlaybookDto = {
      id: 'p2',
      name: 'Contain Login',
      trigger: LOGIN,
      actions: [ISOLATE, NOTIFY],
      createdAt: '2026-11-22T11:00:00Z',
    };
    vi.mocked(playbooksApi.create).mockResolvedValue(created);
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('Name'), '  Contain Login  ');
    await user.selectOptions(screen.getByLabelText('Trigger'), LOGIN.id);
    // Tick Notify first to prove the payload follows catalogue order, not click order.
    await user.click(screen.getByRole('checkbox', { name: 'Notify Admin' }));
    await user.click(screen.getByRole('checkbox', { name: 'Isolate Host' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(playbooksApi.create).toHaveBeenCalledWith({
        name: 'Contain Login',
        triggerId: LOGIN.id,
        actionIds: [ISOLATE.id, NOTIFY.id],
      }),
    );

    // The new playbook is appended from the response, without a refetch.
    expect(await screen.findByText('Contain Login')).toBeInTheDocument();
    expect(playbooksApi.list).toHaveBeenCalledTimes(1);

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Trigger')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Isolate Host' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Notify Admin' })).not.toBeChecked();
  });

  it('ignores a second click while the create request is in flight', async () => {
    vi.mocked(playbooksApi.create).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('Name'), 'Contain');
    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('checkbox', { name: 'Block IP' }));

    const create = screen.getByRole('button', { name: 'Create' });
    await user.dblClick(create);

    await waitFor(() => expect(create).toBeDisabled());
    expect(playbooksApi.create).toHaveBeenCalledTimes(1);
  });

  it('lists existing playbooks in a table', async () => {
    await renderPage();

    const row = screen.getByText('Critical Response').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Malware Detected')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Isolate Host')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete playbook Critical Response' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no playbooks', async () => {
    vi.mocked(playbooksApi.list).mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText('No playbooks yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a playbook name as text, not HTML', async () => {
    const hostile = '<img src="x" alt="pwned">';
    vi.mocked(playbooksApi.list).mockResolvedValue([{ ...EXISTING, name: hostile }]);
    await renderPage();

    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('deletes a playbook after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(playbooksApi.remove).mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete playbook Critical Response' }));

    expect(window.confirm).toHaveBeenCalledWith('Delete playbook "Critical Response"?');
    await waitFor(() => expect(playbooksApi.remove).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByText('Critical Response')).not.toBeInTheDocument());
  });

  it('adds a trigger from Add Trigger and selects it', async () => {
    vi.mocked(triggersApi.listAvailable).mockResolvedValue([PHISHING]);
    vi.mocked(triggersApi.add).mockResolvedValue(PHISHING);
    vi.mocked(triggersApi.listAdded).mockResolvedValue([MALWARE, LOGIN, PHISHING]);
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Add Trigger' }));
    await user.selectOptions(await screen.findByLabelText('Available triggers'), PHISHING.id);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(triggersApi.add).toHaveBeenCalledWith(PHISHING.id));
    await waitFor(() => expect(screen.getByLabelText('Trigger')).toHaveValue(PHISHING.id));
    expect(screen.queryByLabelText('Available triggers')).not.toBeInTheDocument();
  });

  it('disables Create when the user has no triggers', async () => {
    vi.mocked(triggersApi.listAdded).mockResolvedValue([]);
    vi.mocked(triggersApi.listAvailable).mockResolvedValue([PHISHING]);
    await renderPage();

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(screen.getByLabelText('Trigger')).toBeDisabled();
    expect(screen.getByRole('option', { name: 'No triggers added' })).toBeInTheDocument();
    // Add Trigger stays available even with no triggers.
    expect(screen.getByRole('button', { name: 'Add Trigger' })).toBeEnabled();
  });

  it('points to Add Trigger in the empty state', async () => {
    vi.mocked(triggersApi.listAdded).mockResolvedValue([]);
    vi.mocked(triggersApi.listAvailable).mockResolvedValue([PHISHING]);
    await renderPage();

    expect(
      screen.getByText('You have no triggers yet. Click Add Trigger to add one.'),
    ).toBeInTheDocument();
  });

  it('hides the empty-state hint once a trigger is added', async () => {
    vi.mocked(triggersApi.listAdded).mockResolvedValue([]);
    vi.mocked(triggersApi.listAvailable).mockResolvedValue([PHISHING]);
    vi.mocked(triggersApi.add).mockResolvedValue(PHISHING);
    const user = userEvent.setup();
    await renderPage();

    vi.mocked(triggersApi.listAdded).mockResolvedValue([PHISHING]);
    await user.click(screen.getByRole('button', { name: 'Add Trigger' }));
    await user.selectOptions(screen.getByLabelText('Available triggers'), PHISHING.id);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(
        screen.queryByText('You have no triggers yet. Click Add Trigger to add one.'),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows a banner when the server reports the trigger is not added', async () => {
    vi.mocked(playbooksApi.create).mockRejectedValue(
      new ApiError(403, 'TRIGGER_NOT_ADDED', 'Trigger not added'),
    );
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('Name'), 'Contain');
    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('checkbox', { name: 'Block IP' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This trigger is not in your list. Add it again.',
    );
  });

  it('shows a name field error when the playbook name is taken', async () => {
    vi.mocked(playbooksApi.create).mockRejectedValue(
      new ApiError(409, 'PLAYBOOK_NAME_TAKEN', 'Name taken'),
    );
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('Name'), 'Critical Response');
    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('checkbox', { name: 'Block IP' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('A playbook with this name already exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });
});
