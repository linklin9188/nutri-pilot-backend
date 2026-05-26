import { Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Suppliers from './pages/Suppliers';
import SupplierSkus from './pages/SupplierSkus';
import SupplierReport from './pages/SupplierReport';
import Orders from './pages/Orders';
import Commission from './pages/Commission';
import Users from './pages/Users';
import { isAdminLoggedIn } from './lib/auth';

function RequireAdmin({ children }: { children: JSX.Element }) {
  if (!isAdminLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAdmin>
            <Dashboard />
          </RequireAdmin>
        }
      />
      <Route
        path="/suppliers"
        element={
          <RequireAdmin>
            <Suppliers />
          </RequireAdmin>
        }
      />
      <Route
        path="/skus"
        element={
          <RequireAdmin>
            <SupplierSkus />
          </RequireAdmin>
        }
      />
      <Route
        path="/report"
        element={
          <RequireAdmin>
            <SupplierReport />
          </RequireAdmin>
        }
      />
      <Route
        path="/orders"
        element={
          <RequireAdmin>
            <Orders />
          </RequireAdmin>
        }
      />
      <Route
        path="/commission"
        element={
          <RequireAdmin>
            <Commission />
          </RequireAdmin>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAdmin>
            <Users />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
