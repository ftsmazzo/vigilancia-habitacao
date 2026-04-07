import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const KPI_PRINCIPAL = [
  { key: "a1", label: "Pessoas em situacao de rua atendidas (A.1)" },
  { key: "d1", label: "Total de atendimentos no mes (D.1)" },
  { key: "e1", label: "Pessoas abordadas — Abordagem Social (E.1)" },
  { key: "c1", label: "Inclusoes no Cadastro Unico (C.1)" },
  { key: "c2", label: "Atualizacoes do Cadastro Unico (C.2)" },
  { key: "b1", label: "Adultos — crack ou outras drogas (B.1)" }
];

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

export function RmaPopPanel({ usuario }) {
  const podeEnviar = usuario?.role === "MASTER" || usuario?.role === "ADMIN";
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [periodos, setPeriodos] = useState([]);
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");
  const [idUnidadeFiltro, setIdUnidadeFiltro] = useState("");
  const [unidadesAno, setUnidadesAno] = useState([]);
  const [overview, setOverview] = useState(null);
  const [indicadores, setIndicadores] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setErro("");
      try {
        const { data } = await api.get("/rma-pop/periodos");
        if (cancel) return;
        const lista = data?.periodos || [];
        setPeriodos(lista);
        if (lista.length && !ano && !mes) {
          const p = lista[0];
          setAno(String(p.ano));
          setMes(String(p.mes));
        }
      } catch {
        if (!cancel) setErro("Nao foi possivel carregar os periodos.");
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    async function loadInd() {
      try {
        const { data } = await api.get("/rma-pop/indicadores");
        if (!cancel) setIndicadores(data || []);
      } catch {
        /* opcional */
      }
    }
    loadInd();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ano || !mes) return;
    let cancel = false;
    async function loadOverview() {
      setCarregando(true);
      setErro("");
      try {
        const params = { ano, mes };
        if (idUnidadeFiltro) params.idUnidade = idUnidadeFiltro;
        const { data } = await api.get("/rma-pop/overview", { params });
        if (!cancel) setOverview(data);
      } catch {
        if (!cancel) {
          setErro("Falha ao carregar os dados.");
          setOverview(null);
        }
      } finally {
        if (!cancel) setCarregando(false);
      }
    }
    loadOverview();
    return () => {
      cancel = true;
    };
  }, [ano, mes, idUnidadeFiltro]);

  useEffect(() => {
    if (!ano) {
      setUnidadesAno([]);
      return;
    }
    let cancel = false;
    async function loadUnidades() {
      try {
        const { data } = await api.get("/rma-pop/unidades", { params: { ano } });
        if (!cancel) setUnidadesAno(Array.isArray(data) ? data : []);
      } catch {
        if (!cancel) setUnidadesAno([]);
      }
    }
    loadUnidades();
    return () => {
      cancel = true;
    };
  }, [ano]);

  const anosDisponiveis = useMemo(() => {
    const s = new Set();
    for (const p of periodos) s.add(p.ano);
    return Array.from(s).sort((a, b) => b - a);
  }, [periodos]);

  const mesesParaAno = useMemo(() => {
    if (!ano) return [];
    return periodos
      .filter((p) => String(p.ano) === String(ano))
      .map((p) => p.mes)
      .sort((a, b) => a - b);
  }, [periodos, ano]);

  const nomeUnidadeFiltro = useMemo(() => {
    if (!idUnidadeFiltro) return "";
    const u = unidadesAno.find((x) => String(x.idUnidade) === String(idUnidadeFiltro));
    return u?.nomeUnidade?.trim() || "";
  }, [idUnidadeFiltro, unidadesAno]);

  async function enviarArquivo(e) {
    e.preventDefault();
    if (!arquivo) return;
    setEnviando(true);
    setMensagem("");
    setErro("");
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const { data } = await api.post("/rma-pop/upload", fd);
      setMensagem(
        `Importacao concluida: ${data.gravadas ?? 0} linhas gravadas de ${data.processadas ?? 0} processadas.`
      );
      setArquivo(null);
      const periodosResp = await api.get("/rma-pop/periodos");
      const lista = periodosResp.data?.periodos || [];
      setPeriodos(lista);
      if (lista.length) {
        const p = lista[0];
        setAno(String(p.ano));
        setMes(String(p.mes));
      }
    } catch (err) {
      setErro(err?.response?.data?.message || "Falha no upload.");
    } finally {
      setEnviando(false);
    }
  }

  const tot = overview?.totaisMunicipio || {};
  const deriv = overview?.derivados || {};

  const tituloPeriodo =
    overview?.agregacao === "ano"
      ? `Ano ${overview.periodo?.ano} (todos os meses)`
      : overview
        ? `${String(overview.periodo?.mes).padStart(2, "0")}/${overview.periodo?.ano}`
        : "";

  const subtituloResumo = overview?.filtroIdUnidade
    ? "Unidade selecionada"
    : "Totais do municipio";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar rma-sidebar">
        <h3>RMA Centro POP</h3>
        <p className="muted rma-sidebar-lead">
          Registro mensal dos Centros de Referencia Especializado de Assistencia Social (POP) —
          situacao de rua e populacoes em situacao de vulnerabilidade.
        </p>
        {overview ? (
          <div className="rma-sidebar-kpis">
            <div className="rma-sidebar-kpi">
              <span>Unidades no recorte</span>
              <strong>{formatNum(overview.quantidadeUnidades)}</strong>
            </div>
            <div className="rma-sidebar-kpi">
              <span>Atendimentos totais (D.1)</span>
              <strong>{formatNum(tot.d1)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted rma-sidebar-hint">Selecione ano e mes para ver o resumo.</p>
        )}
      </aside>

      <div className="dashboard-grid">
        <section className="card">
          <h2>RMA Centro POP</h2>
          {mensagem ? <p className="success-text">{mensagem}</p> : null}
          {erro ? <p className="error-text">{erro}</p> : null}
        </section>

        {podeEnviar ? (
          <section className="card">
            <h3>Importar dados</h3>
            <p className="muted small-margin-b">Arquivo CSV oficial Centro POP (separador ;)</p>
            <form className="form" onSubmit={enviarArquivo}>
              <label>
                Arquivo
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                />
              </label>
              <button type="submit" disabled={enviando || !arquivo}>
                {enviando ? "Enviando..." : "Importar"}
              </button>
            </form>
          </section>
        ) : null}

        <section className="card">
          <h3>Filtros</h3>
          <div className="metrics-grid rma-filters-grid">
            <div className="metric-item">
              <span>Ano</span>
              <select
                className="enhanced-select"
                value={ano}
                onChange={(e) => {
                  setAno(e.target.value);
                  setMes("");
                  setIdUnidadeFiltro("");
                }}
              >
                <option value="">Selecione</option>
                {anosDisponiveis.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="metric-item">
              <span>Mes</span>
              <select
                className="enhanced-select"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                disabled={!ano}
              >
                <option value="">Selecione</option>
                {ano ? <option value="TODOS">Ano completo</option> : null}
                {mesesParaAno.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="metric-item">
              <span>Unidade</span>
              <select
                className="enhanced-select"
                value={idUnidadeFiltro}
                onChange={(e) => setIdUnidadeFiltro(e.target.value)}
                disabled={!ano}
              >
                <option value="">Todas as unidades</option>
                {unidadesAno.map((u) => (
                  <option key={u.idUnidade} value={u.idUnidade}>
                    {u.nomeUnidade || `Unidade ${u.idUnidade}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {overview && !carregando ? (
            <div className="rma-report-actions">
              <button
                type="button"
                className="ghost-btn rma-pdf-btn"
                onClick={async () => {
                  const { exportRmaPopRelatorioPdf } = await import(
                    "../utils/rmaPopPdfReport.js"
                  );
                  exportRmaPopRelatorioPdf({
                    overview,
                    indicadores,
                    nomeUnidadeSelecionada: nomeUnidadeFiltro
                  });
                }}
              >
                Exportar relatorio PDF
              </button>
              <p className="muted small-margin-b rma-pdf-hint">
                Usa o ano, mes e unidade selecionados acima. O PDF inclui apenas totais numericos
                diferentes de zero na secao detalhada.
              </p>
            </div>
          ) : null}
          {periodos.length === 0 ? (
            <p className="muted">
              Nenhum dado importado. {podeEnviar ? "Importe um CSV para comecar." : null}
            </p>
          ) : null}
        </section>

        {carregando ? (
          <section className="card">
            <p>Carregando...</p>
          </section>
        ) : overview ? (
          <>
            {overview.aviso ? (
              <section className="card">
                <p className="muted">{overview.aviso}</p>
              </section>
            ) : null}
            <section className="card">
              <h3>
                {subtituloResumo} — {tituloPeriodo}
              </h3>
              <div className="metrics-grid rma-kpi-grid">
                {KPI_PRINCIPAL.map((k) => (
                  <div key={k.key} className="metric-item">
                    <span>{k.label}</span>
                    <strong>{formatNum(tot[k.key])}</strong>
                  </div>
                ))}
              </div>
              <div className="metrics-grid rma-kpi-grid rma-kpi-secondary">
                <div className="metric-item">
                  <span>
                    Media de D.1 por unidade
                    {overview.agregacao === "ano" ? " (ano)" : ""}
                  </span>
                  <strong>{formatNum(deriv.mediaD1PorUnidade)}</strong>
                </div>
                <div className="metric-item">
                  <span>Razao (C.1 + C.2) / A.1</span>
                  <strong>
                    {deriv.razaoCadUnicoSobreA1 != null
                      ? deriv.razaoCadUnicoSobreA1.toFixed(3)
                      : "—"}
                  </strong>
                </div>
              </div>
            </section>

            <section className="card">
              <h3>Por unidade</h3>
              <div className="report-table-wrap rma-table-wrap">
                <table className="report-preview-table rma-por-unidade-table">
                  <thead>
                    <tr>
                      <th className="rma-col-unidade">Unidade</th>
                      <th>A.1</th>
                      <th>D.1</th>
                      <th>E.1</th>
                      <th>C.1</th>
                      <th>C.2</th>
                      <th>B.1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.porPop || []).map((row) => {
                      const d = row.destaques || {};
                      return (
                        <tr key={row.idUnidade}>
                          <td className="rma-col-unidade">{row.nomeUnidade || "—"}</td>
                          <td>{formatNum(d.a1)}</td>
                          <td>{formatNum(d.d1)}</td>
                          <td>{formatNum(d.e1)}</td>
                          <td>{formatNum(d.c1)}</td>
                          <td>{formatNum(d.c2)}</td>
                          <td>{formatNum(d.b1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <h3>Indicadores — total municipal</h3>
              <div className="report-table-wrap rma-table-wrap">
                <table className="report-preview-table rma-indicadores-table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicadores.map((ind) => (
                      <tr key={ind.codigo}>
                        <td className="rma-col-desc">{ind.rotulo}</td>
                        <td className="rma-col-num">{formatNum(tot[ind.codigo] ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : periodos.length > 0 && ano && mes ? (
          <section className="card">
            <p className="muted">Sem dados para o periodo.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
