import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/apiClient';
import * as simulationApi from '../src/api/simulationApi';
import * as triggersApi from '../src/api/triggersApi';
import type { SimulationDto, TriggerDto } from '../src/api/types';
import { SimulateEventPage } from '../src/pages/SimulateEventPage';
import { renderWithProviders } from './helpers/renderWithProviders';

vi.mock('../src/api/simulationApi', () => ({ run: vi.fn() }));
vi.mock('../src/api/triggersApi', () => ({
  listAdded: vi.fn(),
  listAvailable: vi.fn(),
  add: vi.fn(),
}));

const MALWARE: TriggerDto = { id: 't1', name: 'Malware Detected' };
const LOGIN: TriggerDto = { id: 't2', name: 'Login Attempt' };

const ISOLATE = { id: 'a1', name: 'Isolate Host' };
const NOTIFY = { id: 'a2', name: 'Notify Admin' };
const BLOCK = { id: 'a3', name: 'Block IP' };

const MATCHING: SimulationDto = {
  trigger: MALWARE,
  matches: [
    { playbook: { id: 'p1', name: 'Critical Response' }, actions: [ISOLATE, NOTIFY] },
    { playbook: { id: 'p2', name: 'Alert and Contain' }, actions: [NOTIFY, BLOCK] },
  ],
};

async function renderPage() {
  const view = renderWithProviders(<SimulateEventPage />, { route: '/simulate' });
  // Wait for the trigger list to load.
  await screen.findByRole('option', { name: 'Malware Detected' });
  return view;
}

describe('SimulateEventPage', () => {
  beforeEach(() => {
    vi.mocked(triggersApi.listAdded).mockResolvedValue([MALWARE, LOGIN]);
    vi.mocked(triggersApi.listAvailable).mockResolvedValue([]);
    vi.mocked(simulationApi.run).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the validation error and sends no request when no trigger is chosen', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Run Simulation' }));

    expect(screen.getByText('Choose a trigger')).toBeInTheDocument();
    expect(simulationApi.run).not.toHaveBeenCalled();
  });

  it('renders each match with its actions in order', async () => {
    vi.mocked(simulationApi.run).mockResolvedValue(MATCHING);
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('button', { name: 'Run Simulation' }));

    expect(await screen.findByText('Playbook: Critical Response')).toBeInTheDocument();
    expect(simulationApi.run).toHaveBeenCalledWith(MALWARE.id);

    const firstMatch = screen.getByText('Playbook: Critical Response').closest('.results__match');
    expect(firstMatch).not.toBeNull();
    const items = within(firstMatch as HTMLElement).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['→ Isolate Host', '→ Notify Admin']);

    expect(screen.getByText('Playbook: Alert and Contain')).toBeInTheDocument();
  });

  it('shows the no-match message when there are no matches', async () => {
    vi.mocked(simulationApi.run).mockResolvedValue({ trigger: MALWARE, matches: [] });
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('button', { name: 'Run Simulation' }));

    expect(await screen.findByText('No matching playbooks.')).toBeInTheDocument();
    expect(screen.queryByText(/^Playbook:/)).not.toBeInTheDocument();
  });

  it('replaces the results on a second run', async () => {
    vi.mocked(simulationApi.run)
      .mockResolvedValueOnce(MATCHING)
      .mockResolvedValueOnce({
        trigger: LOGIN,
        matches: [{ playbook: { id: 'p3', name: 'Login Watch' }, actions: [BLOCK] }],
      });
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('button', { name: 'Run Simulation' }));
    expect(await screen.findByText('Playbook: Critical Response')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Trigger'), LOGIN.id);
    await user.click(screen.getByRole('button', { name: 'Run Simulation' }));

    expect(await screen.findByText('Playbook: Login Watch')).toBeInTheDocument();
    expect(screen.queryByText('Playbook: Critical Response')).not.toBeInTheDocument();
    expect(screen.queryByText('Playbook: Alert and Contain')).not.toBeInTheDocument();
  });

  it('points to the Create Playbook page when the user has no triggers', async () => {
    vi.mocked(triggersApi.listAdded).mockResolvedValue([]);
    const view = renderWithProviders(<SimulateEventPage />, { route: '/simulate' });
    await screen.findByText('You have no triggers yet. Add one on the Create Playbook page.');
    expect(screen.getByLabelText('Trigger')).toBeDisabled();
    view.unmount();
  });

  it('shows nothing in the results before the first run', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: 'Matching Playbooks' })).toBeInTheDocument();
    expect(screen.queryByText('No matching playbooks.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Playbook:/)).not.toBeInTheDocument();
    expect(simulationApi.run).not.toHaveBeenCalled();
  });

  it('renders a playbook name as text, not HTML', async () => {
    const hostile = '<b>bold</b>';
    vi.mocked(simulationApi.run).mockResolvedValue({
      trigger: MALWARE,
      matches: [{ playbook: { id: 'p9', name: hostile }, actions: [ISOLATE] }],
    });
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('button', { name: 'Run Simulation' }));

    expect(await screen.findByText(`Playbook: ${hostile}`)).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('shows a banner when the trigger is not added', async () => {
    vi.mocked(simulationApi.run).mockRejectedValue(
      new ApiError(403, 'TRIGGER_NOT_ADDED', 'Trigger not added'),
    );
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByLabelText('Trigger'), MALWARE.id);
    await user.click(screen.getByRole('button', { name: 'Run Simulation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This trigger is not in your list. Add it again.',
    );
  });
});
