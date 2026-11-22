import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { NavBar } from './components/NavBar';
import { CreatePlaybookPage } from './pages/CreatePlaybookPage';
import { LoginPage } from './pages/LoginPage';
import { SimulateEventPage } from './pages/SimulateEventPage';

/** Top bar, left navigation and the page outlet. Used only for signed-in routes. */
function SignedInLayout() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <SignedInLayout />
          </RequireAuth>
        }
      >
        <Route path="/playbooks" element={<CreatePlaybookPage />} />
        <Route path="/simulate" element={<SimulateEventPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/playbooks" replace />} />
      <Route path="*" element={<Navigate to="/playbooks" replace />} />
    </Routes>
  );
}
