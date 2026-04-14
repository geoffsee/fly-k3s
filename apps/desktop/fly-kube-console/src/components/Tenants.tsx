import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Search, ExternalLink, RefreshCw } from 'lucide-react';

interface Tenant {
  name: string;
  cpu: string;
  memory: string;
  status: 'Active' | 'Provisioning' | 'Failed';
}

const Tenants: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.ipcRenderer.execCommand('kubectl get tenants.platform.fly-k3s.io -o json');
      if (result.error) {
        throw new Error(result.error);
      }
      const data = JSON.parse(result.stdout);
      const mapped: Tenant[] = data.items.map((item: Record<string, any>) => ({
        name: item.metadata?.name || 'unknown',
        cpu: item.spec?.cpu || '—',
        memory: item.spec?.memory || '—',
        status: (['Active', 'Provisioning', 'Failed'].includes(item.status?.phase)
          ? item.status.phase
          : 'Provisioning') as Tenant['status'],
      }));
      setTenants(mapped);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to fetch tenants');
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Tenants</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchTenants}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={18} />
            New Tenant
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
          Note: {error}
        </div>
      )}

      <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search tenants..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {loading && tenants.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : filteredTenants.length === 0 && !error ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          {searchTerm ? 'No tenants match your search.' : 'No tenants found in the cluster.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.map((tenant, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden hover:border-blue-400 dark:hover:border-blue-500 transition-colors group">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{tenant.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-medium ${
                      tenant.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      tenant.status === 'Provisioning' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {tenant.status}
                    </span>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                      <ExternalLink size={18} />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block uppercase font-bold">CPU</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{tenant.cpu} Cores</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block uppercase font-bold">Memory</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{tenant.memory}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-xs text-slate-500">Namespace: tenant-{tenant.name}</span>
                <button className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">View Resources</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tenants;