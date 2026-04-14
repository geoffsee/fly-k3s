import React, { useState } from 'react';
import { Save, Globe, Shield, Terminal } from 'lucide-react';

const Settings: React.FC = () => {
  const [gatewayUrl, setGatewayUrl] = useState('https://tenant-gateway.fly.dev');
  const [clusterRegion, setClusterRegion] = useState('ord');

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Settings</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure your fly-kube environment and console preferences.</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe size={20} className="text-blue-500" />
            Network & Gateway
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Gateway URL</label>
            <input 
              type="text" 
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Default Region</label>
            <select 
              value={clusterRegion}
              onChange={(e) => setClusterRegion(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ord">Chicago (ord)</option>
              <option value="ams">Amsterdam (ams)</option>
              <option value="sin">Singapore (sin)</option>
              <option value="gru">Sao Paulo (gru)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield size={20} className="text-purple-500" />
            Authentication
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">Authenticated with Fly.io as: <span className="font-mono font-bold text-slate-900 dark:text-white">user@example.com</span></p>
          <button className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            Re-authenticate
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Terminal size={20} className="text-orange-500" />
            CLI Tools
          </h3>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">kubectl</span>
              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded font-mono">Installed (v1.27.1)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">flyctl</span>
              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded font-mono">Installed (v0.1.20)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">pulumi</span>
              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded font-mono">Installed (v3.100.0)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-95">
          <Save size={20} />
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default Settings;
