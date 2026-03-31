import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export function VigilanciaDashboardPage({ usuario }) {
  const [erro, setErro] = useState("");
  const [caduStatus, setCaduStatus] = useState(null);
  const [bpcStatus, setBpcStatus] = useState(null);

  useEffect(() => {
    async function carregar() {
      setErro("");
      try {
        const [caduResp, bpcResp] = await Promise.all([api.get("/cadu/status"), api.get("/bpc/status")]);
        setCaduStatus(caduResp.data);
        setBpcStatus(bpcResp.data);
      } catch (_error) {
        setErro("Falha ao carregar dados de vigilancia.");
      }
    }
    carregar();
  }, []);

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <h3>Vigilancia</h3>
        <nav className="sidebar-nav">
          <button type="button" className="sidebar-item active">
            Visao geral
          </button>
        </nav>
      </aside>

      <div className="dashboard-grid">
        <section className="card">
          <h2>Bem-vindo, {usuario?.nome}</h2>
          <p className="muted">
            Perfil atual: <strong>{usuario?.role}</strong>. Este painel mostra apenas informacoes gerais de CADU/BPC.
          </p>
          {erro ? <p className="error-text">{erro}</p> : null}
        </section>

        <section className="card">
          <h3>Base CADU</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span>Total familias</span>
              <strong>{caduStatus?.totalFamilias ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Total pessoas</span>
              <strong>{caduStatus?.totalPessoas ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Familias com Bolsa Familia</span>
              <strong>{caduStatus?.familiasComBolsa ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>% de atualizacao cadastral</span>
              <strong>{caduStatus?.percentualAtualizacaoCadastral || "0%"}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Base BPC</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span>Total BPC</span>
              <strong>{bpcStatus?.total ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>BPC Idoso</span>
              <strong>{bpcStatus?.idosos ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>BPC Deficiente</span>
              <strong>{bpcStatus?.deficientes ?? 0}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

