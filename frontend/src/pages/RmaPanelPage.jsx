import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const KPI_CHAVES = [
  { key: "a1", label: "Familias em acompanhamento PAIF (A.1)" },
  { key: "c1", label: "Atendimentos individualizados (C.1)" },
  { key: "c2c3", label: "Encaminh. CadUnico inclusao + atualiz. (C.2+C.3)", derivado: true },
  { key: "c6", label: "Visitas domiciliares (C.6)" }
];

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

export function RmaPanelPage({ usuario }) {
  const podeEnviar = usuario?.role === "MASTER" || usuario?.role === "ADMIN";
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [periodos, setPeriodos] = useState([]);
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");
  const [idCrasFiltro, setIdCrasFiltro] = useState("");
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
        const { data } = await api.get("/rma/periodos");
        if (cancel) return;
        const lista = data?.periodos || [];
        setPeriodos(lista);
        if (lista.length && !ano && !mes) {
          const p = lista[0];
          setAno(String(p.ano));
          setMes(String(p.mes));
        }
      } catch {
        if (!cancel) setErro("Nao foi possivel carregar periodos RMA.");
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
        const { data } = await api.get("/rma/indicadores");
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
        if (idCrasFiltro) params.idCras = idCrasFiltro;
        const { data } = await api.get("/rma/overview", { params });
        if (!cancel) setOverview(data);
      } catch {
        if (!cancel) {
          setErro("Falha ao carregar dados do periodo.");
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
  }, [ano, mes, idCrasFiltro]);

  useEffect(() => {
    if (!ano) {
      setUnidadesAno([]);
      return;
    }
    let cancel = false;
    async function loadUnidades() {
      try {
        const { data } = await api.get("/rma/unidades", { params: { ano } });
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


  async function enviarArquivo(e) {
    e.preventDefault();
    if (!arquivo) return;
    setEnviando(true);
    setMensagem("");
    setErro("");
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const { data } = await api.post("/rma/upload", fd);
      setMensagem(
        `Importacao concluida: ${data.gravadas ?? 0} linhas gravadas de ${data.processadas ?? 0} processadas.`
      );
      setArquivo(null);
      const periodosResp = await api.get("/rma/periodos");
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
  const rotulo = (codigo) =>
    indicadores.find((i) => i.codigo === codigo)?.rotulo || codigo;

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <h3>RMA</h3>
        <p className="muted">
          Registro mensal por CRAS (id_cras). Totais municipais no periodo selecionado.
        </p>
      </aside>

      <div className="dashboard-grid">
        <section className="card">
          <h2>Painel RMA</h2>
          <p className="muted">
            Usuario: <strong>{usuario?.nome}</strong> ({usuario?.role})
          </p>
          {mensagem ? <p className="success-text">{mensagem}</p> : null}
          {erro ? <p className="error-text">{erro}</p> : null}
        </section>

        {podeEnviar ? (
          <section className="card">
            <h3>Importar CSV (separador ;)</h3>
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
                {enviando ? "Enviando..." : "Enviar e importar"}
              </button>
            </form>
          </section>
        ) : null}

        <section className="card">
          <h3>Periodo</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span>Ano</span>
              <select
                className="enhanced-select"
                value={ano}
                onChange={(e) => {
                  setAno(e.target.value);
                  setMes("");
                  setIdCrasFiltro("");
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
                {ano ? <option value="TODOS">Todos (somar o ano)</option> : null}
                {mesesParaAno.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="metric-item">
              <span>CRAS</span>
              <select
                className="enhanced-select"
                value={idCrasFiltro}
                onChange={(e) => setIdCrasFiltro(e.target.value)}
                disabled={!ano}
              >
                <option value="">Todos os CRAS</option>
                {unidadesAno.map((u) => (
                  <option key={u.idCras} value={u.idCras}>
                    {u.ordem != null ? `${u.ordem}. ` : ""}
                    {u.nomeUnidade || u.idCras}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {periodos.length === 0 ? (
            <p className="muted">
              Nenhum dado RMA importado. {podeEnviar ? "Envie um CSV para comecar." : "Aguarde a importacao pela equipe."}
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
                {overview.filtroIdCras ? "CRAS selecionado" : "Municipio"} —{" "}
                {overview.agregacao === "ano"
                  ? `ano ${overview.periodo?.ano} (todos os meses)`
                  : `${String(overview.periodo?.mes).padStart(2, "0")}/${overview.periodo?.ano}`}
              </h3>
              <p className="muted">
                {overview.agregacao === "ano"
                  ? "CRAS no recorte: "
                  : "CRAS com registro no mes: "}
                <strong>{overview.quantidadeCras ?? 0}</strong>
                {overview.filtroIdCras ? (
                  <>
                    {" "}
                    · id_cras <strong>{overview.filtroIdCras}</strong>
                  </>
                ) : null}
              </p>
              <div className="metrics-grid">
                {KPI_CHAVES.map((k) => {
                  let valor;
                  if (k.derivado && k.key === "c2c3") {
                    valor = (tot.c2 ?? 0) + (tot.c3 ?? 0);
                  } else {
                    valor = tot[k.key];
                  }
                  return (
                    <div key={k.key} className="metric-item" title={rotulo(k.key === "c2c3" ? "c2" : k.key)}>
                      <span>{k.label}</span>
                      <strong>{formatNum(valor)}</strong>
                    </div>
                  );
                })}
                <div className="metric-item">
                  <span>
                    Media C.1 por CRAS
                    {overview.agregacao === "ano" ? " (visao anual)" : " (no mes)"}
                  </span>
                  <strong>{formatNum(deriv.mediaAtendimentosIndividualizadosPorCras)}</strong>
                </div>
                <div className="metric-item">
                  <span>Razao (C.2+C.3) / A.1</span>
                  <strong>
                    {deriv.razaoEncaminhamentosCadUnicoSobreAcompanhamentoPAIF != null
                      ? deriv.razaoEncaminhamentosCadUnicoSobreAcompanhamentoPAIF.toFixed(3)
                      : "—"}
                  </strong>
                </div>
              </div>
            </section>

            <section className="card">
              <h3>Por CRAS (id_cras)</h3>
              <div className="report-table-wrap">
                <table className="report-preview-table">
                  <thead>
                    <tr>
                      <th>id_cras</th>
                      <th>Unidade</th>
                      <th>A.1</th>
                      <th>C.1</th>
                      <th>C.2+C.3</th>
                      <th>C.6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.porCras || []).map((row) => (
                      <tr key={row.idCras}>
                        <td>{row.idCras}</td>
                        <td>{row.nomeUnidade || "—"}</td>
                        <td>{formatNum(row.a1)}</td>
                        <td>{formatNum(row.c1)}</td>
                        <td>{formatNum((row.c2 ?? 0) + (row.c3 ?? 0))}</td>
                        <td>{formatNum(row.c6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <h3>Todos os indicadores (total municipal)</h3>
              <div className="report-table-wrap">
                <table className="report-preview-table">
                  <thead>
                    <tr>
                      <th>Codigo</th>
                      <th>Descricao</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicadores.map((ind) => (
                      <tr key={ind.codigo}>
                        <td>{ind.codigo}</td>
                        <td>{ind.rotulo}</td>
                        <td>{formatNum(tot[ind.codigo])}</td>
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
