import React, { useEffect, useState } from 'react';
import { Server, Cpu, Layers, HardDrive, RefreshCw } from 'lucide-react';

interface K8sNode {
  metadata?: {
    name?: string;
    labels?: Record<string, string>;
  };
  status?: {
    conditions?: Array<{ type: string; status: string }>;
    nodeInfo?: {
      kubeletVersion?: string;
    };
  };
}

const Dashboard: React.FC = () => {
  const [nodes, setNodes] = useState<K8sNode[]>([]);
  const [tenantCount, setTenantCount] = useState<number>(0);
  const [cpuUsage, setCpuUsage] = useState<string>('—');
  const [memoryUsage, setMemoryUsage] = useState<string>('—');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);

    const [nodesResult, tenantsResult, topResult] = await Promise.allSettled([
      window.ipcRenderer.execCommand('kubectl get nodes -o json'),
      window.ipcRenderer.execCommand('kubectl get tenants.platform.fly-k3s.io -o json'),
      window.ipcRenderer.execCommand('kubectl top nodes --no-headers'),
    ]);

    // Nodes
    if (nodesResult.status === 'fulfilled' && !nodesResult.value.error) {
      try {
        const data = JSON.parse(nodesResult.value.stdout);
        setNodes(data.items);
      } catch {
        setError('Failed to parse node data');
        setNodes([
          { metadata: { name: 'k0s-controller' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
          { metadata: { name: 'k0s-worker-1' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
        ]);
      }
    } else {
      setError('Failed to fetch cluster status');
      setNodes([
        { metadata: { name: 'k0s-controller' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
        { metadata: { name: 'k0s-worker-1' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
      ]);
    }

    // Tenants
    if (tenantsResult.status === 'fulfilled' && !tenantsResult.value.error) {
      try {
        const data = JSON.parse(tenantsResult.value.stdout);
        setTenantCount(data.items.length);
      } catch {
        setTenantCount(0);
      }
    } else {
      setTenantCount(0);
    }

    // Resource usage
    if (topResult.status === 'fulfilled' && !topResult.value.error) {
      try {
        const lines = topResult.value.stdout.trim().split('\n').filter(Boolean);
        let totalCpuPercent = 0;
        let totalMemBytes = 0;
        let count = 0;
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          // format: <name> <cpu-cores> <cpu%> <mem-bytes> <mem%>
          if (parts.length >= 5) {
            totalCpuPercent += parseInt(parts[2].replace('%', ''), 10) || 0;
            const memStr = parts[3];
            const memVal = parseInt(memStr, 10) || 0;
            if (memStr.endsWith('Gi')) totalMemBytes += memVal * 1024 * 1024 * 1024;
            else if (memStr.endsWith('Mi')) totalMemBytes += memVal * 1024 * 1024;
            else if (memStr.endsWith('Ki')) totalMemBytes += memVal * 1024;
            else totalMemBytes += memVal;
            count++;
          }
        }
        if (count > 0) {
          setCpuUsage(`${Math.round(totalCpuPercent / count)}%`);
          const gb = totalMemBytes / (1024 * 1024 * 1024);
          setMemoryUsage(gb >= 1 ? `${gb.toFixed(1)} GB` : `${(totalMemBytes / (1024 * 1024)).toFixed(0)} MB`);
        } else {
          setCpuUsage('—');
          setMemoryUsage('—');
        }
      } catch {
        setCpuUsage('—');
        setMemoryUsage('—');
      }
    } else {
      setCpuUsage('—');
      setMemoryUsage('—');
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Cluster Overview</h2>
        <button 
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
          Note: {error}. Showing mock data.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Server size={24} />
            </div>
            {(() => {
              const allReady = nodes.length > 0 && nodes.every(n => n.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True');
              return (
                <span className={`text-xs font-semibold uppercase tracking-wider ${allReady ? 'text-green-500' : 'text-amber-500'}`}>
                  {allReady ? 'Healthy' : 'Degraded'}
                </span>
              );
            })()}
          </div>
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Nodes</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{nodes.length}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
              <Layers size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Tenants</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{tenantCount || '—'}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
              <Cpu size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">CPU Usage</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{cpuUsage}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <HardDrive size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Memory Usage</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{memoryUsage}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Active Nodes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Roles</th>
                <th className="px-6 py-4">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {nodes.map((node, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    {node.metadata?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {node.status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'Not Ready'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {node.metadata?.labels?.['kubernetes.io/role'] || 'worker'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {node.status?.nodeInfo?.kubeletVersion || 'v1.27.x'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
