import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

export function DashboardPage({ usuario, onUsuarioAtualizado }) {
  const isMaster = usuario?.role === "MASTER";
  const isAdmin = usuario?.role === "ADMIN";
  const canOperate = isMaster || isAdmin;
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [secaoAtiva, setSecaoAtiva] = useState("visao-geral");
  const [selecionadoId, setSelecionadoId] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [arquivoCadu, setArquivoCadu] = useState(null);
  const [arquivoBpc, setArquivoBpc] = useState(null);
  const [retornoUpload, setRetornoUpload] = useState(null);
  const [retornoUploadCadu, setRetornoUploadCadu] = useState(null);
  const [enviandoCadu, setEnviandoCadu] = useState(false);
  const [progressoCadu, setProgressoCadu] = useState(0);
  const [enviandoBpc, setEnviandoBpc] = useState(false);
  const [executandoCruzamento, setExecutandoCruzamento] = useState(false);
  const [retornoCruzamento, setRetornoCruzamento] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [resultadosPage, setResultadosPage] = useState(1);
  const [resultadosTotalPages, setResultadosTotalPages] = useState(1);
  const [resultadosTotal, setResultadosTotal] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [filtroPbf, setFiltroPbf] = useState("TODOS");
  const [filtroBpc, setFiltroBpc] = useState("TODOS");
  const [filtroBpcTipo, setFiltroBpcTipo] = useState("TODOS");
  const [busca, setBusca] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [overview, setOverview] = useState(null);
  const [caduStatus, setCaduStatus] = useState(null);
  const [bpcStatus, setBpcStatus] = useState(null);
  const [exportandoRelatorio, setExportandoRelatorio] = useState(false);
  const [relatorioFiltros, setRelatorioFiltros] = useState({
    empreendimentoId: "",
    statusVigilancia: "TODOS",
    pbf: "TODOS",
    bpc: "TODOS",
    bpcTipo: "TODOS",
    q: ""
  });
  const [relatorioColunas, setRelatorioColunas] = useState([
    "empreendimento",
    "nomeInformado",
    "cpf",
    "statusVigilancia",
    "caduDataAtualFam",
    "recebePbf",
    "recebeBpc",
    "tipoBpc"
  ]);
  const [usuarioForm, setUsuarioForm] = useState({
    nome: "",
    email: "",
    senha: "",
    role: "HABITACAO"
  });
  const [usuarioEditId, setUsuarioEditId] = useState("");
  const [usuarioEditForm, setUsuarioEditForm] = useState({
    nome: "",
    email: "",
    role: "HABITACAO",
    ativo: true
  });
  const [meuPerfilForm, setMeuPerfilForm] = useState({
    nome: usuario?.nome || "",
    email: usuario?.email || ""
  });
  const [senhaForm, setSenhaForm] = useState({
    senhaAtual: "",
    novaSenha: ""
  });
  const [form, setForm] = useState({
    nome: "",
    endereco: "",
    municipio: "Ribeirao Preto",
    numUnidades: ""
  });
  const [editEmpId, setEditEmpId] = useState("");
  const [editEmpForm, setEditEmpForm] = useState({
    nome: "",
    endereco: "",
    municipio: "",
    numUnidades: "",
    status: "EM_CAPTACAO"
  });

  async function carregarEmpreendimentos() {
    setCarregando(true);
    setErro("");
    try {
      const { data } = await api.get("/empreendimentos");
      setItens(data);
      if (data[0] && !selecionadoId) {
        setSelecionadoId(data[0].id);
      }
    } catch (_error) {
      setErro("Falha ao carregar empreendimentos.");
    } finally {
      setCarregando(false);
    }
  }

  async function carregarOverview() {
    try {
      const { data } = await api.get("/dashboard/overview");
      setOverview(data);
    } catch (_error) {
      setErro("Falha ao carregar visao geral do dashboard.");
    }
  }

  async function carregarUsuarios() {
    if (!canOperate) return;
    try {
      const { data } = await api.get("/usuarios");
      setUsuarios(data);
    } catch (_error) {
      setErro("Falha ao carregar usuarios.");
    }
  }

  async function carregarCaduStatus() {
    if (!isMaster) return;
    try {
      const { data } = await api.get("/cadu/status");
      setCaduStatus(data);
    } catch (_error) {
      setErro("Falha ao carregar status da base CADU.");
    }
  }

  async function carregarBpcStatus() {
    if (!isMaster) return;
    try {
      const { data } = await api.get("/bpc/status");
      setBpcStatus(data);
    } catch (_error) {
      setErro("Falha ao carregar status da base BPC.");
    }
  }

  useEffect(() => {
    carregarEmpreendimentos();
    carregarUsuarios();
    carregarOverview();
    carregarCaduStatus();
    carregarBpcStatus();
  }, []);

  useEffect(() => {
    setMeuPerfilForm({
      nome: usuario?.nome || "",
      email: usuario?.email || ""
    });
  }, [usuario?.nome, usuario?.email]);

  useEffect(() => {
    setResultadosPage(1);
    carregarResultadosEMetricas();
  }, [selecionadoId]);

  useEffect(() => {
    carregarResultadosEMetricas({ recarregarMetricas: false });
  }, [resultadosPage, filtroStatus, filtroPbf, filtroBpc, filtroBpcTipo]);

  async function criarEmpreendimento(event) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    try {
      await api.post("/empreendimentos", {
        nome: form.nome,
        endereco: form.endereco || undefined,
        municipio: form.municipio || undefined,
        numUnidades: form.numUnidades ? Number(form.numUnidades) : undefined
      });
      setForm({ nome: "", endereco: "", municipio: "Ribeirao Preto", numUnidades: "" });
      await carregarEmpreendimentos();
      await carregarOverview();
      setMensagem("Empreendimento criado com sucesso.");
    } catch (_error) {
      setErro("Falha ao criar empreendimento.");
    }
  }

  async function subirLista(event) {
    event.preventDefault();
    setErro("");
    setRetornoUpload(null);
    if (!selecionadoId || !arquivo) {
      setErro("Selecione empreendimento e arquivo.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      const { data } = await api.post(`/empreendimentos/${selecionadoId}/pre-selecionados/upload`, formData);
      setRetornoUpload(data);
      await carregarResultadosEMetricas();
      await carregarOverview();
      setMensagem("Lista importada com sucesso.");
    } catch (_error) {
      setErro("Falha no upload da lista.");
    }
  }

  async function carregarResultadosEMetricas({ recarregarMetricas = true } = {}) {
    if (!selecionadoId) return;
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("page", String(resultadosPage));
      if (filtroStatus !== "TODOS") params.set("statusVigilancia", filtroStatus);
      if (filtroPbf !== "TODOS") params.set("pbf", filtroPbf);
      if (filtroBpc !== "TODOS") params.set("bpc", filtroBpc);
      if (filtroBpcTipo !== "TODOS") params.set("bpcTipo", filtroBpcTipo);
      if (busca.trim()) params.set("q", busca.trim());

      const requests = [api.get(`/empreendimentos/${selecionadoId}/cruzamento/resultados?${params.toString()}`)];
      if (recarregarMetricas) requests.push(api.get(`/empreendimentos/${selecionadoId}/metricas`));

      const responses = await Promise.all(requests);
      const resultadosResp = responses[0].data;
      if (recarregarMetricas) {
        setMetricas(responses[1].data);
      }
      setResultados(resultadosResp.itens || []);
      setResultadosTotalPages(resultadosResp.totalPages || 1);
      setResultadosTotal(resultadosResp.total || 0);
    } catch (_error) {
      // silencioso para não quebrar fluxo inicial
    }
  }

  async function subirBaseBpc(event) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    if (!arquivoBpc) {
      setErro("Selecione o CSV da base BPC.");
      return;
    }
    try {
      setEnviandoBpc(true);
      const formData = new FormData();
      formData.append("arquivo", arquivoBpc);
      const { data } = await api.post("/bpc/upload", formData);
      setArquivoBpc(null);
      await carregarBpcStatus();
      setMensagem(`Base BPC importada com sucesso. Importados: ${data.importados}`);
    } catch (_error) {
      setErro("Falha no upload da base BPC.");
    } finally {
      setEnviandoBpc(false);
    }
  }

  function aplicarBuscaResultados(event) {
    event.preventDefault();
    setResultadosPage(1);
    carregarResultadosEMetricas({ recarregarMetricas: false });
  }

  async function subirBaseCadu(event) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    setRetornoUploadCadu(null);
    setProgressoCadu(0);
    if (!arquivoCadu) {
      setErro("Selecione o CSV da base CADU.");
      return;
    }

    try {
      setEnviandoCadu(true);
      const init = await api.post("/cadu/upload/init");
      const uploadId = init.data.uploadId;
      const chunkSize = 5 * 1024 * 1024;
      const totalChunks = Math.ceil(arquivoCadu.size / chunkSize);

      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * chunkSize;
        const end = Math.min(arquivoCadu.size, start + chunkSize);
        const chunk = arquivoCadu.slice(start, end);
        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("index", String(index));
        formData.append("totalChunks", String(totalChunks));
        formData.append("fileName", arquivoCadu.name);
        formData.append("chunk", chunk, `${arquivoCadu.name}.part${index}`);
        await api.post("/cadu/upload/chunk", formData, { timeout: 1000 * 60 * 5 });
        setProgressoCadu(Math.round(((index + 1) * 100) / totalChunks));
      }

      const { data } = await api.post("/cadu/upload/finalize", { uploadId }, { timeout: 1000 * 60 * 40 });
      setRetornoUploadCadu(data);
      setArquivoCadu(null);
      await carregarOverview();
      await carregarCaduStatus();
      setMensagem("Base CADU importada com sucesso.");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      if (backendMessage) {
        setErro(`Falha no upload da base CADU: ${backendMessage}`);
      } else {
        setErro("Falha no upload da base CADU.");
      }
    } finally {
      setEnviandoCadu(false);
    }
  }

  async function executarCruzamento() {
    if (!selecionadoId) {
      setErro("Selecione um empreendimento para cruzar.");
      return;
    }
    setErro("");
    setMensagem("");
    setExecutandoCruzamento(true);
    setRetornoCruzamento(null);

    try {
      const { data } = await api.post(`/empreendimentos/${selecionadoId}/cruzamento`);
      setRetornoCruzamento(data);
      await carregarResultadosEMetricas();
      await carregarOverview();
      setMensagem("Cruzamento executado com sucesso.");
    } catch (_error) {
      setErro("Falha ao executar cruzamento.");
    } finally {
      setExecutandoCruzamento(false);
    }
  }

  async function criarUsuario(event) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    try {
      await api.post("/usuarios", usuarioForm);
      setUsuarioForm({ nome: "", email: "", senha: "", role: "HABITACAO" });
      await carregarUsuarios();
      setMensagem("Usuario criado com sucesso.");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErro(backendMessage || "Falha ao criar usuario.");
    }
  }

  async function salvarEdicaoUsuario(event) {
    event.preventDefault();
    if (!usuarioEditId) return;
    setErro("");
    setMensagem("");
    try {
      await api.put(`/usuarios/${usuarioEditId}`, {
        nome: usuarioEditForm.nome,
        email: usuarioEditForm.email,
        role: usuarioEditForm.role,
        ativo: usuarioEditForm.ativo
      });
      await carregarUsuarios();
      setMensagem("Usuario atualizado com sucesso.");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErro(backendMessage || "Falha ao atualizar usuario.");
    }
  }

  async function alterarAtivoUsuario(item, ativo) {
    setErro("");
    setMensagem("");
    try {
      await api.put(`/usuarios/${item.id}`, { ativo });
      await carregarUsuarios();
      setMensagem(`Usuario ${ativo ? "reativado" : "desativado"} com sucesso.`);
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErro(backendMessage || "Falha ao atualizar usuario.");
    }
  }

  function carregarUsuarioEdicao(id) {
    const usuarioSelecionado = usuarios.find((item) => item.id === id);
    if (!usuarioSelecionado) return;
    setUsuarioEditForm({
      nome: usuarioSelecionado.nome || "",
      email: usuarioSelecionado.email || "",
      role: usuarioSelecionado.role || "HABITACAO",
      ativo: Boolean(usuarioSelecionado.ativo)
    });
  }

  async function salvarMeuPerfil(event) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    try {
      const { data } = await api.put("/auth/me", meuPerfilForm);
      onUsuarioAtualizado?.(data);
      setMensagem("Perfil atualizado com sucesso.");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErro(backendMessage || "Falha ao atualizar perfil.");
    }
  }

  async function alterarMinhaSenha(event) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    try {
      await api.put("/auth/me/senha", senhaForm);
      setSenhaForm({ senhaAtual: "", novaSenha: "" });
      setMensagem("Senha alterada com sucesso.");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErro(backendMessage || "Falha ao alterar senha.");
    }
  }

  async function carregarEmpreendimentoEdicao(id) {
    if (!id) return;
    try {
      const { data } = await api.get(`/empreendimentos/${id}`);
      setEditEmpForm({
        nome: data.nome || "",
        endereco: data.endereco || "",
        municipio: data.municipio || "",
        numUnidades: data.numUnidades || "",
        status: data.status || "EM_CAPTACAO"
      });
    } catch (_error) {
      setErro("Falha ao carregar empreendimento para edicao.");
    }
  }

  async function salvarEdicaoEmpreendimento(event) {
    event.preventDefault();
    if (!editEmpId) return;
    setErro("");
    setMensagem("");
    try {
      await api.put(`/empreendimentos/${editEmpId}`, {
        nome: editEmpForm.nome,
        endereco: editEmpForm.endereco || undefined,
        municipio: editEmpForm.municipio || undefined,
        numUnidades: editEmpForm.numUnidades ? Number(editEmpForm.numUnidades) : undefined,
        status: editEmpForm.status
      });
      await carregarEmpreendimentos();
      await carregarOverview();
      if (selecionadoId === editEmpId) {
        await carregarResultadosEMetricas();
      }
      setMensagem("Empreendimento atualizado com sucesso.");
    } catch (_error) {
      setErro("Falha ao atualizar empreendimento.");
    }
  }

  const secoes = useMemo(() => {
    const base = [
      { id: "visao-geral", label: "Visao geral" },
      { id: "empreendimentos", label: "Empreendimentos" },
      { id: "listas-cruzamento", label: "Listas e cruzamento" },
      { id: "minha-conta", label: "Minha conta" }
    ];
    if (canOperate) {
      base.push({ id: "relatorios", label: "Relatorios" });
    }
    if (isMaster) {
      base.splice(1, 0, { id: "base-cadu", label: "Base CADU" });
    }
    if (canOperate) {
      base.push({ id: "usuarios", label: "Usuarios" });
    }
    return base;
  }, [isMaster, canOperate]);
  const empreendimentoSelecionado = itens.find((item) => item.id === selecionadoId);
  const opcoesColunasRelatorio = [
    { key: "empreendimento", label: "Empreendimento" },
    { key: "nomeInformado", label: "Nome informado (lista)" },
    { key: "cpf", label: "CPF" },
    { key: "nisInformado", label: "NIS informado (lista)" },
    { key: "contato", label: "Contato (lista)" },
    { key: "statusVigilancia", label: "Status vigilancia" },
    { key: "motivoStatus", label: "Motivo status" },
    { key: "dataAtualizacaoInscricao", label: "Data atualizacao inscricao" },
    { key: "cruzadoEm", label: "Data do cruzamento" },
    { key: "caduNome", label: "Nome CADU" },
    { key: "caduNis", label: "NIS CADU" },
    { key: "caduDataAtualFam", label: "Data atualizacao CADU" },
    { key: "recebePbf", label: "Recebe Bolsa Familia" },
    { key: "recebeBpc", label: "Recebe BPC" },
    { key: "tipoBpc", label: "Tipo BPC" }
  ];

  function alternarColunaRelatorio(coluna) {
    setRelatorioColunas((prev) => {
      if (prev.includes(coluna)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== coluna);
      }
      return [...prev, coluna];
    });
  }

  async function exportarRelatorioXlsx(event) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    try {
      setExportandoRelatorio(true);
      const payload = {
        ...relatorioFiltros,
        empreendimentoId: relatorioFiltros.empreendimentoId || undefined,
        q: relatorioFiltros.q || undefined,
        columns: relatorioColunas
      };
      const response = await api.post("/relatorios/export-xlsx", payload, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const nomeArquivo = `relatorio-vigilancia-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.href = url;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMensagem("Relatorio XLSX gerado com sucesso.");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErro(backendMessage || "Falha ao gerar relatorio XLSX.");
    } finally {
      setExportandoRelatorio(false);
    }
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <h3>Painel</h3>
        <nav className="sidebar-nav">
          {secoes.map((secao) => (
            <button
              key={secao.id}
              type="button"
              className={secaoAtiva === secao.id ? "sidebar-item active" : "sidebar-item"}
              onClick={() => setSecaoAtiva(secao.id)}
            >
              {secao.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="dashboard-grid">
        <section className="card">
          <h2>Bem-vindo, {usuario?.nome}</h2>
          <p className="muted">
            Perfil atual: <strong>{usuario?.role}</strong>. O perfil MASTER administra usuarios e acessa todos os
            dados.
          </p>
          {mensagem ? <p className="success-text">{mensagem}</p> : null}
          {erro ? <p className="error-text">{erro}</p> : null}
        </section>

        {isMaster && secaoAtiva === "base-cadu" ? (
          <>
            <section className="card">
              <h3>Upload base CADU (.csv)</h3>
              <form className="form" onSubmit={subirBaseCadu}>
                <label>
                  Arquivo base
                  <input type="file" accept=".csv" onChange={(e) => setArquivoCadu(e.target.files?.[0] || null)} />
                </label>
                <button type="submit" disabled={enviandoCadu}>
                  {enviandoCadu ? "Enviando..." : "Importar base CADU"}
                </button>
              </form>
              {enviandoCadu ? <p className="muted">Progresso de envio: {progressoCadu}%</p> : null}
              {retornoUploadCadu ? (
                <p className="muted">
                  Total: {retornoUploadCadu.total} | Pessoas: {retornoUploadCadu.inseridos} | Familias:{" "}
                  {retornoUploadCadu.familias} | Ignorados CPF invalido: {retornoUploadCadu.ignoradosCpfInvalido}
                </p>
              ) : null}
            </section>

            <section className="card">
              <h3>Ultima base implantada</h3>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span>Data do upload</span>
                  <strong>
                    {caduStatus?.ultimoUpload?.finalizadoEm
                      ? new Date(caduStatus.ultimoUpload.finalizadoEm).toLocaleString("pt-BR")
                      : "-"}
                  </strong>
                </div>
                <div className="metric-item">
                  <span>Data da base (referencia)</span>
                  <strong>
                    {caduStatus?.dataBaseReferencia
                      ? new Date(caduStatus.dataBaseReferencia).toLocaleDateString("pt-BR")
                      : "-"}
                  </strong>
                </div>
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
                  <span>Cadastros atualizados</span>
                  <strong>{caduStatus?.familiasAtualizadas ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>Cadastros desatualizados</span>
                  <strong>{caduStatus?.familiasDesatualizadas ?? 0}</strong>
                </div>
                <div className="metric-item">
                  <span>% de atualização cadastral</span>
                  <strong>{caduStatus?.percentualAtualizacaoCadastral || "0%"}</strong>
                </div>
              </div>
            </section>

            <section className="card">
              <h3>Upload base BPC (.csv)</h3>
              <form className="form" onSubmit={subirBaseBpc}>
                <label>
                  Arquivo BPC
                  <input type="file" accept=".csv" onChange={(e) => setArquivoBpc(e.target.files?.[0] || null)} />
                </label>
                <button type="submit" disabled={enviandoBpc}>
                  {enviandoBpc ? "Enviando..." : "Importar base BPC"}
                </button>
              </form>
            </section>

            <section className="card">
              <h3>Status base BPC</h3>
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
                <div className="metric-item">
                  <span>Referencia BPC</span>
                  <strong>
                    {bpcStatus?.competenciaReferencia
                      ? new Date(bpcStatus.competenciaReferencia).toLocaleDateString("pt-BR")
                      : "-"}
                  </strong>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {secaoAtiva === "visao-geral" ? (
          <>
            <section className="card card-span-2">
              <h3>Empreendimento em foco</h3>
              <label className="fit-select">
                <select className="focus-select" value={selecionadoId} onChange={(e) => setSelecionadoId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {itens.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="kpi-grid">
              <article className="kpi-card">
                <small>Total de empreendimentos</small>
                <strong>{overview?.cards?.totalEmpreendimentos ?? 0}</strong>
              </article>
              <article className="kpi-card">
                <small>Total de familias CADU</small>
                <strong>{overview?.cards?.totalFamiliasCadu ?? 0}</strong>
              </article>
              <article className="kpi-card">
                <small>Total de pessoas CADU</small>
                <strong>{overview?.cards?.totalPessoasCadu ?? 0}</strong>
              </article>
              <article className="kpi-card">
                <small>Total BPC</small>
                <strong>{overview?.cards?.totalBpc ?? 0}</strong>
              </article>
              <article className="kpi-card">
                <small>BPC Idoso</small>
                <strong>{overview?.cards?.totalBpcIdoso ?? 0}</strong>
              </article>
              <article className="kpi-card">
                <small>BPC Deficiente</small>
                <strong>{overview?.cards?.totalBpcDeficiente ?? 0}</strong>
              </article>
            </section>

            {metricas ? (
              <section className="card card-span-2">
                <h3>Metricas do empreendimento: {empreendimentoSelecionado?.nome || "Sem selecao"}</h3>
                <div className="metrics-grid">
                  <div className="metric-item"><span>Total listados</span><strong>{metricas.totalListados}</strong></div>
                  <div className="metric-item"><span>Encontrados</span><strong>{metricas.encontrados}</strong></div>
                  <div className="metric-item"><span>Nao encontrados</span><strong>{metricas.naoEncontrados}</strong></div>
                  <div className="metric-item"><span>Atualizados</span><strong>{metricas.atualizados}</strong></div>
                  <div className="metric-item"><span>Desatualizados</span><strong>{metricas.desatualizados}</strong></div>
                  <div className="metric-item"><span>Beneficiarios PBF</span><strong>{metricas.beneficiariosPbf}</strong></div>
                  <div className="metric-item"><span>Beneficiarios BPC</span><strong>{metricas.beneficiariosBpc}</strong></div>
                  <div className="metric-item"><span>BPC Idoso</span><strong>{metricas.beneficiariosBpcIdoso}</strong></div>
                  <div className="metric-item"><span>BPC Deficiente</span><strong>{metricas.beneficiariosBpcDeficiente}</strong></div>
                  <div className="metric-item"><span>Cobertura</span><strong>{metricas.percentualCobertura}</strong></div>
                  <div className="metric-item"><span>PBF entre encontrados</span><strong>{metricas.percentualPbfEncontrados}</strong></div>
                  <div className="metric-item"><span>BPC entre encontrados</span><strong>{metricas.percentualBpcEncontrados}</strong></div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {secaoAtiva === "empreendimentos" ? (
          <>
            {canOperate ? (
              <>
                <section className="card">
                  <h3>Criar empreendimento</h3>
                  <form className="form" onSubmit={criarEmpreendimento}>
                    <label>
                      Nome
                      <input
                        value={form.nome}
                        onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      Endereco
                      <input value={form.endereco} onChange={(e) => setForm((s) => ({ ...s, endereco: e.target.value }))} />
                    </label>
                    <label>
                      Municipio
                      <input value={form.municipio} onChange={(e) => setForm((s) => ({ ...s, municipio: e.target.value }))} />
                    </label>
                    <label>
                      Numero de unidades
                      <input
                        value={form.numUnidades}
                        onChange={(e) => setForm((s) => ({ ...s, numUnidades: e.target.value }))}
                        type="number"
                        min="1"
                      />
                    </label>
                    <button type="submit">Salvar empreendimento</button>
                  </form>
                </section>

                <section className="card">
                  <h3>Editar empreendimento</h3>
                  <form className="form" onSubmit={salvarEdicaoEmpreendimento}>
                    <label>
                      Empreendimento
                      <select
                        className="enhanced-select"
                        value={editEmpId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setEditEmpId(nextId);
                          carregarEmpreendimentoEdicao(nextId);
                        }}
                      >
                        <option value="">Selecione...</option>
                        {itens.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Nome
                      <input
                        value={editEmpForm.nome}
                        onChange={(e) => setEditEmpForm((s) => ({ ...s, nome: e.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      Endereco
                      <input
                        value={editEmpForm.endereco}
                        onChange={(e) => setEditEmpForm((s) => ({ ...s, endereco: e.target.value }))}
                      />
                    </label>
                    <label>
                      Municipio
                      <input
                        value={editEmpForm.municipio}
                        onChange={(e) => setEditEmpForm((s) => ({ ...s, municipio: e.target.value }))}
                      />
                    </label>
                    <label>
                      Numero de unidades
                      <input
                        value={editEmpForm.numUnidades}
                        onChange={(e) => setEditEmpForm((s) => ({ ...s, numUnidades: e.target.value }))}
                        type="number"
                        min="1"
                      />
                    </label>
                    <label>
                      Status
                      <select
                        className="enhanced-select"
                        value={editEmpForm.status}
                        onChange={(e) => setEditEmpForm((s) => ({ ...s, status: e.target.value }))}
                      >
                        <option value="EM_CAPTACAO">EM_CAPTACAO</option>
                        <option value="EM_ANALISE">EM_ANALISE</option>
                        <option value="CONCLUIDO">CONCLUIDO</option>
                      </select>
                    </label>
                    <button type="submit" disabled={!editEmpId}>
                      Salvar alteracoes
                    </button>
                  </form>
                </section>
              </>
            ) : null}

            <section className="card">
              <h3>Empreendimentos</h3>
              {carregando ? <p className="muted">Carregando...</p> : null}
              {!carregando && itens.length === 0 ? <p className="muted">Nenhum empreendimento cadastrado.</p> : null}
              {itens.length > 0 ? (
                <div className="list">
                  {itens.map((item) => (
                    <article className="list-item" key={item.id}>
                      <strong>{item.nome}</strong>
                      <small className="muted">
                        {item.municipio || "Sem municipio"} · {item.status}
                      </small>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        {secaoAtiva === "listas-cruzamento" ? (
          <>
            <div className="split-grid card-span-2">
              {canOperate ? (
                <>
                  <section className="card">
                    <h3>Upload da lista para cruzamento</h3>
                    <form className="form" onSubmit={subirLista}>
                      <label>
                        Empreendimento
                        <select className="enhanced-select" value={selecionadoId} onChange={(e) => setSelecionadoId(e.target.value)}>
                          <option value="">Selecione...</option>
                          {itens.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Arquivo
                        <input type="file" accept=".xls,.xlsx" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
                      </label>
                      <button type="submit">Importar lista</button>
                    </form>
                    {retornoUpload ? (
                      <p className="muted">
                        Importados: {retornoUpload.importados} | Ignorados: {retornoUpload.ignorados} | Erros:{" "}
                        {retornoUpload.erros?.length || 0}
                      </p>
                    ) : null}
                  </section>

                  <section className="card">
                    <h3>Execução do cruzamento</h3>
                    <p className="muted">Após importar a lista, execute o cruzamento para atualizar os indicadores.</p>
                    <button type="button" onClick={executarCruzamento} disabled={!selecionadoId || executandoCruzamento}>
                      {executandoCruzamento ? "Executando cruzamento..." : "Executar cruzamento"}
                    </button>
                    {retornoCruzamento ? (
                      <p className="muted">
                        Cruzados: {retornoCruzamento.total} | Encontrados: {retornoCruzamento.encontrados} | Nao encontrados:{" "}
                        {retornoCruzamento.naoEncontrados} | PBF: {retornoCruzamento.beneficiariosPbf}
                      </p>
                    ) : null}
                  </section>
                </>
              ) : (
                <section className="card">
                  <h3>Modo consultivo</h3>
                  <p className="muted">
                    Seu perfil HABITACAO possui acesso de consulta. Upload e cruzamento sao executados por MASTER/ADMIN.
                  </p>
                </section>
              )}
            </div>

            <section className="card card-span-2">
              <h3>Resultados do cruzamento</h3>
              <div className="filters-grid">
                <label>
                  Empreendimento
                  <select className="enhanced-select" value={selecionadoId} onChange={(e) => setSelecionadoId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {itens.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    className="enhanced-select"
                    value={filtroStatus}
                    onChange={(e) => {
                      setResultadosPage(1);
                      setFiltroStatus(e.target.value);
                    }}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="ATUALIZADO">Atualizado</option>
                    <option value="DESATUALIZADO">Desatualizado</option>
                    <option value="NAO_ENCONTRADO">Nao encontrado</option>
                  </select>
                </label>
                <label>
                  Bolsa Familia
                  <select
                    className="enhanced-select"
                    value={filtroPbf}
                    onChange={(e) => {
                      setResultadosPage(1);
                      setFiltroPbf(e.target.value);
                    }}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="COM_BOLSA">Com bolsa</option>
                    <option value="SEM_BOLSA">Sem bolsa</option>
                  </select>
                </label>
                <label>
                  BPC
                  <select
                    className="enhanced-select"
                    value={filtroBpc}
                    onChange={(e) => {
                      setResultadosPage(1);
                      setFiltroBpc(e.target.value);
                    }}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="COM_BPC">Com BPC</option>
                    <option value="SEM_BPC">Sem BPC</option>
                  </select>
                </label>
                <label>
                  Tipo BPC
                  <select
                    className="enhanced-select"
                    value={filtroBpcTipo}
                    onChange={(e) => {
                      setResultadosPage(1);
                      setFiltroBpcTipo(e.target.value);
                    }}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="IDOSO">Idoso</option>
                    <option value="DEFICIENTE">Deficiente</option>
                  </select>
                </label>
                <form className="filter-search" onSubmit={aplicarBuscaResultados}>
                  <label>
                    Busca (nome ou CPF)
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar" />
                  </label>
                  <button type="submit">Filtrar</button>
                </form>
              </div>

              {resultados.length > 0 ? (
                <div className="list">
                  {resultados.map((item) => (
                    <article className="list-item" key={item.id}>
                      <strong>
                        {item.nomeInformado || "Sem nome"} - {item.cpf}
                      </strong>
                      <small className="muted">
                        {item.statusVigilancia} · {item.motivoStatus || "Sem observacao"} ·{" "}
                        {item.recebePbfCalculado ? "Com Bolsa Familia" : "Sem Bolsa Familia"} ·{" "}
                        {item.recebeBpcCalculado ? `BPC ${item.tipoBpcCalculado || ""}` : "Sem BPC"}
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">Sem resultados para exibir.</p>
              )}
              <div className="pagination-row">
                <small className="muted">
                  Total filtrado: {resultadosTotal} · Pagina {resultadosPage} de {resultadosTotalPages}
                </small>
                <div className="row-actions">
                  <button
                    type="button"
                    disabled={resultadosPage <= 1}
                    onClick={() => setResultadosPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={resultadosPage >= resultadosTotalPages}
                    onClick={() => setResultadosPage((p) => Math.min(resultadosTotalPages, p + 1))}
                  >
                    Proxima
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {canOperate && secaoAtiva === "usuarios" ? (
          <>
            <section className="card">
              <h3>Criar usuario</h3>
              <form className="form" onSubmit={criarUsuario}>
                <label>
                  Nome
                  <input
                    value={usuarioForm.nome}
                    onChange={(e) => setUsuarioForm((s) => ({ ...s, nome: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={usuarioForm.email}
                    onChange={(e) => setUsuarioForm((s) => ({ ...s, email: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Senha
                  <input
                    type="password"
                    value={usuarioForm.senha}
                    onChange={(e) => setUsuarioForm((s) => ({ ...s, senha: e.target.value }))}
                    required
                  />
                </label>
                <small className="muted">Senha forte: 8+ caracteres com maiuscula, minuscula, numero e simbolo.</small>
                <label>
                  Perfil
                  <select
                    className="enhanced-select"
                    value={usuarioForm.role}
                    onChange={(e) => setUsuarioForm((s) => ({ ...s, role: e.target.value }))}
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="HABITACAO">HABITACAO</option>
                  </select>
                </label>
                <button type="submit">Criar usuario</button>
              </form>
            </section>

            <section className="card">
              <h3>Editar usuario</h3>
              <form className="form" onSubmit={salvarEdicaoUsuario}>
                <label>
                  Usuario
                  <select
                    className="enhanced-select"
                    value={usuarioEditId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setUsuarioEditId(nextId);
                      carregarUsuarioEdicao(nextId);
                    }}
                  >
                    <option value="">Selecione...</option>
                    {usuarios.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} ({item.role})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome
                  <input
                    value={usuarioEditForm.nome}
                    onChange={(e) => setUsuarioEditForm((s) => ({ ...s, nome: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={usuarioEditForm.email}
                    onChange={(e) => setUsuarioEditForm((s) => ({ ...s, email: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Perfil
                  <select
                    className="enhanced-select"
                    value={usuarioEditForm.role}
                    onChange={(e) => setUsuarioEditForm((s) => ({ ...s, role: e.target.value }))}
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="HABITACAO">HABITACAO</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={usuarioEditForm.ativo}
                    onChange={(e) => setUsuarioEditForm((s) => ({ ...s, ativo: e.target.checked }))}
                  />{" "}
                  Usuario ativo
                </label>
                <button type="submit" disabled={!usuarioEditId}>
                  Salvar usuario
                </button>
              </form>
            </section>

            <section className="card">
              <h3>Usuarios cadastrados</h3>
              {usuarios.length === 0 ? (
                <p className="muted">Nenhum usuario cadastrado.</p>
              ) : (
                <div className="list">
                  {usuarios.map((item) => (
                    <article className="list-item" key={item.id}>
                      <strong>
                        {item.nome} ({item.role})
                      </strong>
                      <small className="muted">
                        {item.email} · {item.ativo ? "Ativo" : "Inativo"}
                      </small>
                      <div className="row-actions">
                        {item.ativo ? (
                          <button type="button" onClick={() => alterarAtivoUsuario(item, false)}>
                            Desativar
                          </button>
                        ) : (
                          <button type="button" onClick={() => alterarAtivoUsuario(item, true)}>
                            Reativar
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

        {canOperate && secaoAtiva === "relatorios" ? (
          <section className="card card-span-2">
            <h3>Relatorios dinamicos (XLSX)</h3>
            <p className="muted">
              Escolha os filtros, marque os campos desejados e exporte uma lista enxuta para acao operacional.
            </p>
            <form className="form" onSubmit={exportarRelatorioXlsx}>
              <div className="filters-grid">
                <label>
                  Empreendimento
                  <select
                    className="enhanced-select"
                    value={relatorioFiltros.empreendimentoId}
                    onChange={(e) => setRelatorioFiltros((s) => ({ ...s, empreendimentoId: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    {itens.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    className="enhanced-select"
                    value={relatorioFiltros.statusVigilancia}
                    onChange={(e) => setRelatorioFiltros((s) => ({ ...s, statusVigilancia: e.target.value }))}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="NAO_ENCONTRADO">Nao encontrado</option>
                    <option value="DESATUALIZADO">Desatualizado</option>
                    <option value="ATUALIZADO">Atualizado</option>
                  </select>
                </label>
                <label>
                  Bolsa Familia
                  <select
                    className="enhanced-select"
                    value={relatorioFiltros.pbf}
                    onChange={(e) => setRelatorioFiltros((s) => ({ ...s, pbf: e.target.value }))}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="COM_BOLSA">Com bolsa</option>
                    <option value="SEM_BOLSA">Sem bolsa</option>
                  </select>
                </label>
                <label>
                  BPC
                  <select
                    className="enhanced-select"
                    value={relatorioFiltros.bpc}
                    onChange={(e) => setRelatorioFiltros((s) => ({ ...s, bpc: e.target.value }))}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="COM_BPC">Com BPC</option>
                    <option value="SEM_BPC">Sem BPC</option>
                  </select>
                </label>
                <label>
                  Tipo BPC
                  <select
                    className="enhanced-select"
                    value={relatorioFiltros.bpcTipo}
                    onChange={(e) => setRelatorioFiltros((s) => ({ ...s, bpcTipo: e.target.value }))}
                  >
                    <option value="TODOS">Todos</option>
                    <option value="IDOSO">Idoso</option>
                    <option value="DEFICIENTE">Deficiente</option>
                  </select>
                </label>
                <label>
                  Busca (nome ou CPF)
                  <input
                    value={relatorioFiltros.q}
                    onChange={(e) => setRelatorioFiltros((s) => ({ ...s, q: e.target.value }))}
                    placeholder="Digite para filtrar"
                  />
                </label>
              </div>

              <div className="list">
                {opcoesColunasRelatorio.map((coluna) => (
                  <label key={coluna.key} className="list-item">
                    <input
                      type="checkbox"
                      checked={relatorioColunas.includes(coluna.key)}
                      onChange={() => alternarColunaRelatorio(coluna.key)}
                    />
                    <span>{coluna.label}</span>
                  </label>
                ))}
              </div>

              <button type="submit" disabled={exportandoRelatorio}>
                {exportandoRelatorio ? "Gerando XLSX..." : "Exportar XLSX"}
              </button>
            </form>
          </section>
        ) : null}

        {secaoAtiva === "minha-conta" ? (
          <>
            <section className="card">
              <h3>Meu perfil</h3>
              <form className="form" onSubmit={salvarMeuPerfil}>
                <label>
                  Nome
                  <input
                    value={meuPerfilForm.nome}
                    onChange={(e) => setMeuPerfilForm((s) => ({ ...s, nome: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={meuPerfilForm.email}
                    onChange={(e) => setMeuPerfilForm((s) => ({ ...s, email: e.target.value }))}
                    required
                  />
                </label>
                <button type="submit">Salvar perfil</button>
              </form>
            </section>

            <section className="card">
              <h3>Alterar senha</h3>
              <form className="form" onSubmit={alterarMinhaSenha}>
                <label>
                  Senha atual
                  <input
                    type="password"
                    value={senhaForm.senhaAtual}
                    onChange={(e) => setSenhaForm((s) => ({ ...s, senhaAtual: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Nova senha
                  <input
                    type="password"
                    value={senhaForm.novaSenha}
                    onChange={(e) => setSenhaForm((s) => ({ ...s, novaSenha: e.target.value }))}
                    required
                  />
                </label>
                <small className="muted">Senha forte: 8+ caracteres com maiuscula, minuscula, numero e simbolo.</small>
                <button type="submit">Atualizar senha</button>
              </form>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
