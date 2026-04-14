import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';

const mockExecCommand = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.ipcRenderer = {
    execCommand: mockExecCommand,
  } as unknown as typeof window.ipcRenderer;
});

function makeNodesResponse(nodes: Array<{ name: string; ready: boolean; version?: string }>) {
  return {
    stdout: JSON.stringify({
      items: nodes.map((n) => ({
        metadata: { name: n.name, labels: {} },
        status: {
          conditions: [{ type: 'Ready', status: n.ready ? 'True' : 'False' }],
          nodeInfo: { kubeletVersion: n.version ?? 'v1.30.0' },
        },
      })),
    }),
    stderr: '',
    error: null,
  };
}

function makeTenantsResponse(count: number) {
  return {
    stdout: JSON.stringify({
      items: Array.from({ length: count }, (_, i) => ({
        metadata: { name: `tenant-${i}` },
        spec: { cpu: '2', memory: '4Gi' },
        status: { phase: 'Active' },
      })),
    }),
    stderr: '',
    error: null,
  };
}

function makeTopNodesResponse(lines: string[]) {
  return { stdout: lines.join('\n'), stderr: '', error: null };
}

function failedResult() {
  return { stdout: '', stderr: 'error', error: 'command failed' };
}

describe('Dashboard', () => {
  it('shows live node count and healthy badge when all nodes ready', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([
        { name: 'node-1', ready: true },
        { name: 'node-2', ready: true },
      ]))
      .mockResolvedValueOnce(makeTenantsResponse(5))
      .mockResolvedValueOnce(makeTopNodesResponse([
        'node-1   250m   12%   1024Mi   40%',
        'node-2   500m   25%   2048Mi   60%',
      ]));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows degraded badge when a node is not ready', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([
        { name: 'node-1', ready: true },
        { name: 'node-2', ready: false },
      ]))
      .mockResolvedValueOnce(makeTenantsResponse(1))
      .mockResolvedValueOnce(failedResult());

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
    });
  });

  it('shows live tenant count', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([{ name: 'node-1', ready: true }]))
      .mockResolvedValueOnce(makeTenantsResponse(7))
      .mockResolvedValueOnce(failedResult());

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  it('shows dash for tenants when fetch fails', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([{ name: 'node-1', ready: true }]))
      .mockResolvedValueOnce(failedResult())
      .mockResolvedValueOnce(failedResult());

    render(<Dashboard />);

    const tenantsHeading = await screen.findByText('Tenants');
    const tenantsCard = tenantsHeading.closest('div.bg-white, div.dark\\:bg-slate-800')!;
    expect(tenantsCard).toHaveTextContent('—');
  });

  it('shows parsed CPU and memory from kubectl top', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([{ name: 'node-1', ready: true }]))
      .mockResolvedValueOnce(makeTenantsResponse(1))
      .mockResolvedValueOnce(makeTopNodesResponse([
        'node-1   250m   30%   3072Mi   55%',
        'node-2   500m   50%   1024Mi   40%',
      ]));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('40%')).toBeInTheDocument();
    });
    expect(screen.getByText('4.0 GB')).toBeInTheDocument();
  });

  it('shows dash for CPU and memory when kubectl top fails', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([{ name: 'node-1', ready: true }]))
      .mockResolvedValueOnce(makeTenantsResponse(1))
      .mockResolvedValueOnce(failedResult());

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    });

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows mock nodes and error banner when nodes fetch fails', async () => {
    mockExecCommand
      .mockResolvedValueOnce(failedResult())
      .mockResolvedValueOnce(makeTenantsResponse(1))
      .mockResolvedValueOnce(failedResult());

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch cluster status/)).toBeInTheDocument();
    });
    expect(screen.getByText('k0s-controller')).toBeInTheDocument();
    expect(screen.getByText('k0s-worker-1')).toBeInTheDocument();
  });

  it('renders node table rows with correct data', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([
        { name: 'master-1', ready: true, version: 'v1.31.0' },
      ]))
      .mockResolvedValueOnce(makeTenantsResponse(0))
      .mockResolvedValueOnce(failedResult());

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('master-1')).toBeInTheDocument();
    });
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('v1.31.0')).toBeInTheDocument();
  });

  it('refresh button re-fetches all data', async () => {
    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([{ name: 'node-1', ready: true }]))
      .mockResolvedValueOnce(makeTenantsResponse(2))
      .mockResolvedValueOnce(failedResult());

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('node-1')).toBeInTheDocument();
    });

    mockExecCommand
      .mockResolvedValueOnce(makeNodesResponse([{ name: 'node-1', ready: true }, { name: 'node-2', ready: true }]))
      .mockResolvedValueOnce(makeTenantsResponse(5))
      .mockResolvedValueOnce(failedResult());

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.getByText('node-2')).toBeInTheDocument();
    });
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
