import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Periods from './pages/Periods'
import Items from './pages/Items'
import Vendors from './pages/Vendors'
import Purchases from './pages/Purchases'
import Stock from './pages/Stock'
import Recipes from './pages/Recipes'
import Sales from './pages/Sales'
import Variance from './pages/Variance'
import MonthlySummary from './pages/MonthlySummary'
import AdminClients from './pages/AdminClients'
import './components/Layout.css'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="/dashboard"  element={<Dashboard />} />
            <Route path="/periods"    element={<Periods />} />
            <Route path="/items"      element={<Items />} />
            <Route path="/vendors"    element={<Vendors />} />
            <Route path="/purchases"  element={<Purchases />} />
            <Route path="/stock"      element={<Stock />} />
            <Route path="/recipes"    element={<Recipes />} />
            <Route path="/sales"      element={<Sales />} />
            <Route path="/variance"   element={<Variance />} />
            <Route path="/summary"    element={<MonthlySummary />} />
            <Route path="/admin/clients" element={
              <ProtectedRoute adminOnly>
                <AdminClients />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
