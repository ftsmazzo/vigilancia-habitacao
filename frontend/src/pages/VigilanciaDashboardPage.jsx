import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export function VigilanciaDashboardPage({ usuario }) {
  const [erro, setErro] = useState("");
  const [caduStatus, setCaduStatus] = useState(null);
  const [bpcStatus, setBpcStatus] = useState(null);
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    async function carregar() {
      setErro("");
      try {
        const [caduResp, bpcResp, overviewResp] = await Promise.all([
          api.get("/cadu/status"),
          api.get("/bpc/status"),
          api.get("/vigilancia/overview")
        ]);
        setCaduStatus(caduResp.data);
        setBpcStatus(bpcResp.data);
        setOverview(overviewResp.data);
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
          <h3>Distribuicao por sexo</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span>Total pessoas (CADU)</span>
              <strong>{overview?.cards?.totalPessoas ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Homens</span>
              <strong>{overview?.cards?.totalHomens ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Mulheres</span>
              <strong>{overview?.cards?.totalMulheres ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Faixas etarias (CADU)</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span>Primeira infancia (0 a 5 anos)</span>
              <strong>{overview?.cards?.primeiraInfancia ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Criancas e adolescentes (6 a 14)</span>
              <strong>{overview?.cards?.criancasAdolescentes ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Adolescentes (15 a 17)</span>
              <strong>{overview?.cards?.adolescentes ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Jovens (18 a 29)</span>
              <strong>{overview?.cards?.jovens ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Adultos (30 a 59)</span>
              <strong>{overview?.cards?.adultos ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Pessoas idosas (60+)</span>
              <strong>{overview?.cards?.idosos ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Situacoes especificas</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span>Pessoas com deficiencia (CADU)</span>
              <strong>{overview?.cards?.pessoasComDeficiencia ?? 0}</strong>
            </div>
            <div className="metric-item">
              <span>Familias em pobreza (ate 1/2 SM per capita)</span>
              <strong>{overview?.cards?.familiasPobrezaMeioSalario ?? 0}</strong>
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

