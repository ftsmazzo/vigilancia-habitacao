import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { api } from "./services/api.js";

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  async function carregarUsuario() {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setUsuario(null);
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get("/auth/me");
      setUsuario(data);
    } catch (_error) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUsuario(null);
    } finally {
      setLoading(false);
    }
  }

  function sair() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUsuario(null);
  }

  useEffect(() => {
    carregarUsuario();
  }, []);

  if (loading) {
    return (
      <main className="container">
        <section className="card">
          <p>Carregando...</p>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Vigilancia Habitacao</h1>
          <small>Painel socioassistencial de cruzamento CADU</small>
        </div>
        <nav>
          {!usuario ? <Link to="/login">Login</Link> : null}
          {usuario ? <Link to="/dashboard">Dashboard</Link> : null}
          {usuario ? (
            <button type="button" className="ghost-btn" onClick={sair}>
              Sair
            </button>
          ) : null}
        </nav>
      </header>

      <main className="container">
        <Routes>
          <Route path="/login" element={!usuario ? <LoginPage onLoginSuccess={carregarUsuario} /> : <Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={usuario ? <DashboardPage usuario={usuario} onUsuarioAtualizado={setUsuario} /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}
