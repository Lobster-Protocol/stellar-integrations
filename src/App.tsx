import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Overview from './pages/Overview'
import Performance from './pages/Performance'
import Activity from './pages/Activity'
import Allocation from './pages/Allocation'
import Bridges from './pages/Bridges'

export default function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/allocation" element={<Allocation />} />
            <Route path="/bridges" element={<Bridges />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
