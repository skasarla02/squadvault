import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { Simulator } from "@/pages/Simulator";
import { VaultDetail } from "@/pages/VaultDetail";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/simulator" element={<Simulator />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/vaults/:id"
        element={
          <RequireAuth>
            <VaultDetail />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default App;
