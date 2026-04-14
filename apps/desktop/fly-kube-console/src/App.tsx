import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Tenants from './components/Tenants'
import Settings from './components/Settings'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />
      case 'tenants':
        return <Tenants />
      case 'settings':
        return <Settings />
      case 'monitoring':
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <h2 className="text-2xl font-bold mb-2">Monitoring</h2>
            <p>Prometheus & Grafana integration coming soon.</p>
          </div>
        )
      case 'terminal':
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <h2 className="text-2xl font-bold mb-2">Terminal</h2>
            <p>Integrated kubectl terminal coming soon.</p>
          </div>
        )
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}

export default App
