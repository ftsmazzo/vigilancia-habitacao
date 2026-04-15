import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export function VigilanciaDashboardPage({ usuario }) {
  const [erro, setErro] = useState("");
  const [caduStatus, setCaduStatus] = useState(null);
  const [bpcStatus, setBpcStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [atualizandoBases, setAtualizandoBases] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [secaoAtiva, setSecaoAtiva] = useState("visao-geral");
  const [unidades, setUnidades] = useState([]);
  const [unidadeSelecionada, setUnidadeSelecionada] = useState("TODOS");
  const [bairros, setBairros] = useState([]);
  const [bairrosSelecionados, setBairrosSelecionados] = useState([]);

  useEffect(() => {
    async function carregar() {
      setErro("");
      try {
        const params = new URLSearchParams();
        if (unidadeSelecionada && unidadeSelecionada !== "TODOS") {
          params.set("unidadeTerritorial", unidadeSelecionada);
        }
        if (bairrosSelecionados.length > 0) {
          bairrosSelecionados.forEach((b) => {
            params.append("bairros", b);
          });
        }

        const [caduResp, bpcResp, overviewResp] = await Promise.all([
          api.get("/cadu/status"),
          api.get("/bpc/status"),
          api.get(
            params.toString()
              ? `/vigilancia/overview?${params.toString()}`
              : "/vigilancia/overview"
          )
        ]);
        setCaduStatus(caduResp.data);
        setBpcStatus(bpcResp.data);
        setOverview(overviewResp.data);
      } catch (_error) {
        setErro("Falha ao carregar dados de vigilancia.");
      }
    }
    carregar();
  }, [unidadeSelecionada, bairrosSelecionados]);

  useEffect(() => {
    async function carregarUnidades() {
      try {
        const { data } = await api.get("/vigilancia/unidades");
        setUnidades(data || []);
      } catch {
        // silencioso: se falhar, apenas nao mostra seletor
      }
    }
    carregarUnidades();
  }, []);

  // Carrega bairros quando a unidade territorial muda
  useEffect(() => {
    async function carregarBairros() {
      setBairros([]);
      setBairrosSelecionados([]);

      if (!unidadeSelecionada || unidadeSelecionada === "TODOS") {
        return;
      }

      try {
        const { data } = await api.get(
          `/vigilancia/bairros?unidadeTerritorial=${encodeURIComponent(unidadeSelecionada)}`
        );
        setBairros(data || []);
      } catch {
        // se falhar, apenas nao exibe bairros
      }
    }

    carregarBairros();
  }, [unidadeSelecionada]);

  const cards = overview?.cards || {};
  const totalPessoas = cards.totalPessoas || 0;
  const totalFamilias = cards.totalFamilias || 0;
  const pct = (valor, total) =>
    total > 0 ? `${((valor / total) * 100).toFixed(1)}%` : "0%";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <h3>Vigilancia</h3>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={secaoAtiva === "visao-geral" ? "sidebar-item active" : "sidebar-item"}
            onClick={() => setSecaoAtiva("visao-geral")}
          >
            Visao geral
          </button>
          <button
            type="button"
            className={secaoAtiva === "administracao" ? "sidebar-item active" : "sidebar-item"}
            onClick={() => setSecaoAtiva("administracao")}
          >
            Administracao
          </button>
        </nav>
      </aside>

      <div className="dashboard-grid">
        {secaoAtiva === "visao-geral" ? (
          <>
            <section className="card">
              <h2>Bem-vindo, {usuario?.nome}</h2>
              <p className="muted">
                Perfil atual: <strong>{usuario?.role}</strong>. Este painel mostra um panorama territorial de familias,
                pessoas e beneficios, com foco em vigilancia socioassistencial.
              </p>
              {mensagem ? <p className="success-text">{mensagem}</p> : null}
              {erro ? <p className="error-text">{erro}</p> : null}
            </section>

            <section className="card">
              <h3>Area do CRAS / Unidade territorial</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Selecione a unidade territorial</span>
                  <select
                    className="enhanced-select"
                    value={unidadeSelecionada}
                    onChange={(e) => setUnidadeSelecionada(e.target.value || "TODOS")}
                  >
                    <option value="TODOS">Todos os CRAS</option>
                    {unidades.map((u) => (
                      <option key={u.codigo} value={u.codigo}>
                        {u.nome || u.codigo}
                      </option>
                    ))}
                  </select>
                </div>
                {unidadeSelecionada !== "TODOS" && bairros.length > 0 ? (
                  <div className="metric-item">
                    <span>Selecione o bairro/localidade</span>
                    <select
                      multiple
                      className="enhanced-select"
                      value={bairrosSelecionados}
                      onChange={(e) => {
                        const values = Array.from(e.target.selectedOptions).map(
                          (o) => o.value
                        );
                        setBairrosSelecionados(values);
                      }}
                    >
                      {bairros.map((b) => (
                        <option key={b.nome} value={b.nome}>
                          {b.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Bloco 1 – KPIs macro de familias/pessoas (territorializados) */}
            <section className="card">
              <h3>Panorama geral de familias e pessoas</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Familias (neste recorte territorial)</span>
                  <strong>{totalFamilias}</strong>
                </div>
                <div className="metric-item">
                  <span>Pessoas (neste recorte territorial)</span>
                  <strong>{totalPessoas}</strong>
                </div>
                <div className="metric-item">
                  <span>Pessoas com deficiencia</span>
                  <strong>
                    {cards.pessoasComDeficiencia ?? 0}{" "}
                    <small className="muted">({pct(cards.pessoasComDeficiencia || 0, totalPessoas)})</small>
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Pessoas com BPC</span>
                  <strong>
                    {cards.pessoasComBpc ?? 0}{" "}
                    <small className="muted">({pct(cards.pessoasComBpc || 0, totalPessoas)})</small>
                  </strong>
                </div>
              </div>
            </section>

            {/* Bloco 2 – Composicao demografica */}
            <section className="card">
              <h3>Distribuicao por sexo</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Total de pessoas (base de referencia)</span>
                  <strong>{overview?.cards?.totalPessoas ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Homens</span>
                  <strong>
                    {cards.totalHomens ?? 0}{" "}
                    <small className="muted">({pct(cards.totalHomens || 0, totalPessoas)})</small>
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Mulheres</span>
                  <strong>
                    {cards.totalMulheres ?? 0}{" "}
                    <small className="muted">({pct(cards.totalMulheres || 0, totalPessoas)})</small>
                  </strong>
                </div>
              </div>
            </section>

            <section className="card">
              <h3>Faixas etarias (pessoas)</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Primeira infancia (0 a 6 anos)</span>
                  <strong>{overview?.cards?.primeiraInfancia ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Criancas e adolescentes (7 a 15)</span>
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

            {/* Bloco 3 – Condicao socioeconomica das familias */}
            <section className="card">
              <h3>Renda familiar per capita</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Familias em pobreza (ate R$ 218,00)</span>
                  <strong>
                    {cards.familiasPobreza ?? 0}{" "}
                    <small className="muted">
                      ({pct(cards.familiasPobreza || 0, totalFamilias)})
                    </small>
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Familias em baixa renda (R$ 218,01 a R$ 810,14)</span>
                  <strong>
                    {cards.familiasBaixaRenda ?? 0}{" "}
                    <small className="muted">
                      ({pct(cards.familiasBaixaRenda || 0, totalFamilias)})
                    </small>
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Familias acima de meio salario minimo (&gt; R$ 810,14)</span>
                  <strong>
                    {cards.familiasAcimaMeioSalario ?? 0}{" "}
                    <small className="muted">
                      ({pct(cards.familiasAcimaMeioSalario || 0, totalFamilias)})
                    </small>
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Familias com beneficio de renda (PBF)</span>
                  <strong>
                    {cards.familiasComPbf ?? 0}{" "}
                    <small className="muted">
                      ({pct(cards.familiasComPbf || 0, totalFamilias)})
                    </small>
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Familias em situacao de risco de violacao de direitos</span>
                  <strong>
                    {cards.familiasRiscoViolacao ?? 0}{" "}
                    <small className="muted">
                      ({pct(cards.familiasRiscoViolacao || 0, totalFamilias)})
                    </small>
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Familias em risco para inseguranca alimentar</span>
                  <strong>
                    {cards.familiasInsegurancaAlimentar ?? 0}{" "}
                    <small className="muted">
                      ({pct(cards.familiasInsegurancaAlimentar || 0, totalFamilias)})
                    </small>
                  </strong>
                </div>
              </div>
            </section>

            {/* Bloco 4 – Pessoas com deficiencia (tipos) */}
            <section className="card">
              <h3>Pessoas com deficiencia</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Deficiencia visual (cegueira/baixa visao)</span>
                  <strong>{overview?.cards?.defVisual ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Deficiencia auditiva (surdez leve/profunda)</span>
                  <strong>{overview?.cards?.defAuditiva ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Deficiencia fisica</span>
                  <strong>{overview?.cards?.defFisica ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Deficiencia intelectual (mental/Down)</span>
                  <strong>{overview?.cards?.defIntelectual ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Transtorno/doenca mental</span>
                  <strong>{overview?.cards?.defMental ?? 0}</strong>
                </div>
              </div>
            </section>

            {/* Bloco 5 – BPC cruzado com o publico da base de referencia */}
            <section className="card">
              <h3>Beneficio de Prestacao Continuada (entre as pessoas da base)</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Pessoas com BPC (qualquer tipo)</span>
                  <strong>{overview?.cards?.pessoasComBpc ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Pessoas com BPC Idoso</span>
                  <strong>{overview?.cards?.pessoasBpcIdoso ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Pessoas com BPC por deficiencia</span>
                  <strong>{overview?.cards?.pessoasBpcDeficiencia ?? 0}</strong>
                </div>
              </div>
            </section>

            {/* Bloco 6 – Populacoes prioritarias */}
            <section className="card">
              <h3>Populacoes prioritarias</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Pessoas em trabalho infantil</span>
                  <strong>{overview?.cards?.pessoasTrabalhoInfantil ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Pessoas em situacao de rua</span>
                  <strong>{overview?.cards?.pessoasSituacaoRua ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Criancas/adolescentes 7 a 15 fora da escola</span>
                  <strong>{overview?.cards?.criancasForaEscola ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Adultos (18+) com baixa escolaridade</span>
                  <strong>{overview?.cards?.adultosBaixaEscolaridade ?? 0}</strong>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {secaoAtiva === "administracao" ? (
          <>
            <section className="card">
              <h2>Administracao de vigilancia</h2>
              <p className="muted">
                Operacoes de manutencao das views e estruturas de vigilancia. Use apenas apos importar novas bases CADU e BPC.
              </p>
            </section>

            <section className="card">
              <h3>Base de Vigilancia (familias e pessoas)</h3>
              <p className="muted">
                Sempre que uma nova base CADU ou BPC for importada, atualize as estruturas de vigilancia. Isso atualiza as
                materializadas <strong>vw_vig_familias</strong> e <strong>vw_vig_pessoas</strong> e recria as views do agente
                NL→SQL <strong>vw_agente_familias</strong> e <strong>vw_agente_pessoas</strong> (schema <strong>public</strong>
                ), com BPC nas pessoas e Bolsa Familia cruzada (familia + cadastro individual). Em bases grandes pode levar
                varios minutos.
              </p>
              <button
                type="button"
                disabled={atualizandoBases}
                onClick={async () => {
                  setErro("");
                  setMensagem("");
                  setAtualizandoBases(true);
                  try {
                    const { data } = await api.post("/vigilancia/atualizar-bases", null, {
                      timeout: 20 * 60 * 1000
                    });
                    const duracaoSeg = data?.duracaoMs ? Math.round(data.duracaoMs / 1000) : null;
                    const extras = Array.isArray(data?.viewsAgente) ? data.viewsAgente.join(", ") : "";
                    setMensagem(
                      duracaoSeg !== null
                        ? `Bases atualizadas em ${duracaoSeg}s.${extras ? ` Views agente: ${extras}.` : ""}`
                        : `Bases atualizadas com sucesso.${extras ? ` Views agente: ${extras}.` : ""}`
                    );
                  } catch (error) {
                    const backendMessage = error?.response?.data?.message;
                    const isTimeout = error?.code === "ECONNABORTED";
                    setErro(
                      isTimeout
                        ? "Tempo esgotado (20 min). O servidor pode ainda estar processando — verifique os logs ou tente de novo."
                        : backendMessage || "Falha ao atualizar as bases de vigilancia."
                    );
                  } finally {
                    setAtualizandoBases(false);
                  }
                }}
              >
                {atualizandoBases ? "Atualizando bases..." : "Atualizar bases de vigilancia"}
              </button>
              {atualizandoBases ? (
                <p className="muted" style={{ marginTop: "0.75rem" }}>
                  Aguarde: refresh das materialized views pode demorar.
                </p>
              ) : null}
              {mensagem ? <p className="success-text" style={{ marginTop: "0.75rem" }}>{mensagem}</p> : null}
              {erro ? <p className="error-text" style={{ marginTop: "0.75rem" }}>{erro}</p> : null}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

