import { Link, Navigate, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";

export default function App() {
  return (
    <div>
      <header className="topbar">
        <h1>Vigilancia Habitacao</h1>
        <nav>
          <Link to="/login">Login</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <main className="container">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}
