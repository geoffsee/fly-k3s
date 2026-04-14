import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Tenants from './Tenants';

const mockExecCommand = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.ipcRenderer = {
    execCommand: mockExecCommand,
  } as unknown as typeof window.ipcRenderer;
});

function makeTenantsResponse(tenants: Array<{ name: string; cpu: string; memory: string; phase: string }>) {
  return {
    stdout: JSON.stringify({
      items: tenants.map((t) => ({
        metadata: { name: t.name },
        spec: { cpu: t.cpu, memory: t.memory },
        status: { phase: t.phase },
      })),
    }),
    stderr: '',
    error: null,
  };
}

function failedResult() {
  return { stdout: '', stderr: 'error', error: 'command failed' };
}

describe('Tenants', () => {
  it('fetches and renders tenant cards', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'acme-corp', cpu: '2', memory: '4Gi', phase: 'Active' },
      { name: 'globex', cpu: '1', memory: '2Gi', phase: 'Provisioning' },
    ]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('acme-corp')).toBeInTheDocument();
    });
    expect(screen.getByText('globex')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Provisioning')).toBeInTheDocument();
    expect(screen.getByText('2 Cores')).toBeInTheDocument();
    expect(screen.getByText('4Gi')).toBeInTheDocument();
  });

  it('shows error banner when fetch fails', async () => {
    mockExecCommand.mockResolvedValueOnce(failedResult());

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText(/command failed/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no tenants exist', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('No tenants found in the cluster.')).toBeInTheDocument();
    });
  });

  it('filters tenants by search term', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'acme-corp', cpu: '2', memory: '4Gi', phase: 'Active' },
      { name: 'globex', cpu: '1', memory: '2Gi', phase: 'Active' },
    ]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('acme-corp')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Search tenants...'), 'globex');

    expect(screen.queryByText('acme-corp')).not.toBeInTheDocument();
    expect(screen.getByText('globex')).toBeInTheDocument();
  });

  it('shows no-match message when search has no results', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'acme-corp', cpu: '2', memory: '4Gi', phase: 'Active' },
    ]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('acme-corp')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Search tenants...'), 'zzz');

    expect(screen.getByText('No tenants match your search.')).toBeInTheDocument();
  });

  it('defaults unknown phase to Provisioning', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'weird-tenant', cpu: '1', memory: '1Gi', phase: 'SomeUnknownPhase' },
    ]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('weird-tenant')).toBeInTheDocument();
    });
    expect(screen.getByText('Provisioning')).toBeInTheDocument();
  });

  it('shows Failed status with red styling', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'broken-tenant', cpu: '1', memory: '1Gi', phase: 'Failed' },
    ]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
    const badge = screen.getByText('Failed');
    expect(badge.className).toContain('bg-red-100');
  });

  it('shows namespace based on tenant name', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'acme-corp', cpu: '2', memory: '4Gi', phase: 'Active' },
    ]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('Namespace: tenant-acme-corp')).toBeInTheDocument();
    });
  });

  it('refresh button re-fetches tenants', async () => {
    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'acme-corp', cpu: '2', memory: '4Gi', phase: 'Active' },
    ]));

    render(<Tenants />);

    await waitFor(() => {
      expect(screen.getByText('acme-corp')).toBeInTheDocument();
    });

    mockExecCommand.mockResolvedValueOnce(makeTenantsResponse([
      { name: 'acme-corp', cpu: '2', memory: '4Gi', phase: 'Active' },
      { name: 'new-tenant', cpu: '4', memory: '8Gi', phase: 'Provisioning' },
    ]));

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.getByText('new-tenant')).toBeInTheDocument();
    });
  });

  it('shows loading spinner on initial load', () => {
    mockExecCommand.mockReturnValue(new Promise(() => {})); // never resolves
    render(<Tenants />);
    // The RefreshCw spinner should be visible (the centered one, not the button one)
    const spinners = document.querySelectorAll('.animate-spin');
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});
