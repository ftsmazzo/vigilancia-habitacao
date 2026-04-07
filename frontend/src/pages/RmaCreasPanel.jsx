import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api.js";
import { setAssistenteContextoRma } from "../utils/assistenteContextStorage.js";

const KPI_PRINCIPAL = [
  { key: "a1", label: "Casos em acompanhamento PAEFI (A.1)" },
  { key: "a2", label: "Novos casos PAEFI (A.2)" },
  { key: "b1", label: "Familias no Bolsa Familia (B.1)" },
  { key: "c1", label: "Violencia intrafamiliar — criancas (C.1)" },
  { key: "m1", label: "Atendimentos individualizados (M.1)" },
  { key: "m4", label: "Visitas domiciliares (M.4)" }
];

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

export function RmaCreasPanel({ usuario }) {
  const navigate = useNavigate();
  const podeEnviar = usuario?.role === "MASTER" || usuario?.role === "ADMIN";
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [periodos, setPeriodos] = useState([]);
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");
  const [idCreasFiltro, setIdCreasFiltro] = useState("");
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
        const { data } = await api.get("/rma-creas/periodos");
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
        const { data } = await api.get("/rma-creas/indicadores");
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
        if (idCreasFiltro) params.idCreas = idCreasFiltro;
        const { data } = await api.get("/rma-creas/overview", { params });
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
  }, [ano, mes, idCreasFiltro]);

  useEffect(() => {
    if (!ano) {
      setUnidadesAno([]);
      return;
    }
    let cancel = false;
    async function loadUnidades() {
      try {
        const { data } = await api.get("/rma-creas/unidades", { params: { ano } });
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
    if (!idCreasFiltro) return "";
    const u = unidadesAno.find((x) => String(x.idCreas) === String(idCreasFiltro));
    return u?.nomeUnidade?.trim() || "";
  }, [idCreasFiltro, unidadesAno]);

  async function enviarArquivo(e) {
    e.preventDefault();
    if (!arquivo) return;
    setEnviando(true);
    setMensagem("");
    setErro("");
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const { data } = await api.post("/rma-creas/upload", fd);
      setMensagem(
        `Importacao concluida: ${data.gravadas ?? 0} linhas gravadas de ${data.processadas ?? 0} processadas.`
      );
      setArquivo(null);
      const periodosResp = await api.get("/rma-creas/periodos");
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

  const subtituloResumo = overview?.filtroIdCreas
    ? "Unidade selecionada"
    : "Totais do municipio";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar rma-sidebar">
        <h3>RMA CREAS</h3>
        <p className="muted rma-sidebar-lead">
          Registro mensal dos equipamentos CREAS (medidas de protecao a adolescentes e atendimento
          especializado).
        </p>
        {overview ? (
          <div className="rma-sidebar-kpis">
            <div className="rma-sidebar-kpi">
              <span>Unidades no recorte</span>
              <strong>{formatNum(overview.quantidadeUnidades)}</strong>
            </div>
            <div className="rma-sidebar-kpi">
              <span>Atendimentos individualizados (M.1)</span>
              <strong>{formatNum(tot.m1)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted rma-sidebar-hint">Selecione ano e mes para ver o resumo.</p>
        )}
      </aside>

      <div className="dashboard-grid">
        <section className="card">
          <h2>RMA CREAS</h2>
          {mensagem ? <p className="success-text">{mensagem}</p> : null}
          {erro ? <p className="error-text">{erro}</p> : null}
        </section>

        {podeEnviar ? (
          <section className="card">
            <h3>Importar dados</h3>
            <p className="muted small-margin-b">Arquivo CSV oficial CREAS (separador ;)</p>
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
                  setIdCreasFiltro("");
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
                value={idCreasFiltro}
                onChange={(e) => setIdCreasFiltro(e.target.value)}
                disabled={!ano}
              >
                <option value="">Todas as unidades</option>
                {unidadesAno.map((u) => (
                  <option key={u.idCreas} value={u.idCreas}>
                    {u.ordem != null ? `${u.ordem}. ` : ""}
                    {u.nomeUnidade || `Unidade ${u.idCreas}`}
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
                  const { exportRmaCreasRelatorioPdf } = await import(
                    "../utils/rmaCreasPdfReport.js"
                  );
                  exportRmaCreasRelatorioPdf({
                    overview,
                    indicadores,
                    nomeUnidadeSelecionada: nomeUnidadeFiltro
                  });
                }}
              >
                Exportar relatorio PDF
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setAssistenteContextoRma({
                    tipo: "rma-creas",
                    titulo: "RMA CREAS",
                    filtros: {
                      ano,
                      mes,
                      idCreas: idCreasFiltro || null,
                      unidade: nomeUnidadeFiltro || null
                    },
                    overview
                  });
                  navigate("/assistente");
                }}
              >
                Enviar recorte ao assistente
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
                    Media de M.1 por unidade
                    {overview.agregacao === "ano" ? " (ano)" : ""}
                  </span>
                  <strong>{formatNum(deriv.mediaAtendimentosIndivPorUnidade)}</strong>
                </div>
                <div className="metric-item">
                  <span>Razao novos casos (A.2) / acompanhamento (A.1)</span>
                  <strong>
                    {deriv.razaoNovosCasosSobreAcompanhamento != null
                      ? deriv.razaoNovosCasosSobreAcompanhamento.toFixed(3)
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
                      <th>A.2</th>
                      <th>M.1</th>
                      <th>M.4</th>
                      <th>C.1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.porCreas || []).map((row) => {
                      const d = row.destaques || {};
                      return (
                        <tr key={row.idCreas}>
                          <td className="rma-col-unidade">{row.nomeUnidade || "—"}</td>
                          <td>{formatNum(d.a1)}</td>
                          <td>{formatNum(d.a2)}</td>
                          <td>{formatNum(d.m1)}</td>
                          <td>{formatNum(d.m4)}</td>
                          <td>{formatNum(d.c1)}</td>
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
