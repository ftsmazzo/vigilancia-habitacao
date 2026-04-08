import { prisma } from "../utils/prisma.js";
import {
  getVigilanciaOverviewCards,
  listarUnidadesTerritoriaisVigilancia
} from "./vigilanciaOverview.service.js";
import {
  getBpcImportStatusSnapshot,
  getCaduImportStatusSnapshot
} from "./caduBpcImportSnapshot.service.js";

const MAX_UNIDADES_CRAS_PAINEL = 80;
const CADU_MESES_ATUALIZACAO = Math.max(
  1,
  Number(process.env.CADU_ATUALIZACAO_MESES || 24)
);

function sumMetricasRows(rows, chave) {
  return rows.reduce((s, r) => {
    const m = r.metricas && typeof r.metricas === "object" ? r.metricas : {};
    return s + (Number(m[chave]) || 0);
  }, 0);
}

/**
 * Familias e pessoas CadUnico cujo campo municipio na familia casa com o nome do municipio.
 */
export async function resumoCadunicoPorMunicipio(nomeMunicipio) {
  const termo = nomeMunicipio?.trim();
  if (!termo) return null;

  const familias = await prisma.caduFamilia.count({
    where: { municipio: { contains: termo, mode: "insensitive" } }
  });

  const pessoasAgg = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT p.id)::int AS n
    FROM "CaduPessoa" p
    INNER JOIN "CaduFamilia" f ON f."codFamiliarFam" = p."codFamiliarFam"
    WHERE f.municipio ILIKE ${"%" + termo.replace(/[%_]/g, "") + "%"}
  `;
  const pessoas = Number(pessoasAgg?.[0]?.n ?? 0);

  return {
    familiasCadastradas: familias,
    pessoasVinculadasFamilias: pessoas,
    criterio:
      "Filtro pelo campo municipio da familia (importacoes CADU). Pode nao cobrir 100% do territorio se o campo vier vazio ou divergente."
  };
}

export async function resumoBpcPorMunicipio(nomeMunicipio, uf) {
  const termo = nomeMunicipio?.trim();
  if (!termo) return null;
  const where = {
    municipio: { contains: termo, mode: "insensitive" }
  };
  if (uf && String(uf).length === 2) {
    where.uf = String(uf).toUpperCase();
  }
  const total = await prisma.bpcBeneficio.count({ where });
  return { beneficiariosBpc: total };
}

function mesRefLabel(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  return `${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
}

export async function resumoRmaCrasPorIbge(codigoIbge) {
  const ibge = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  const last = await prisma.rmaRegistroMensal.findFirst({
    where: { codigoIbge: ibge },
    orderBy: { mesReferencia: "desc" }
  });
  if (!last) return null;
  const rows = await prisma.rmaRegistroMensal.findMany({
    where: { codigoIbge: ibge, mesReferencia: last.mesReferencia }
  });
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return {
    painel: "RMA CRAS",
    mesReferencia: last.mesReferencia,
    mesLabel: mesRefLabel(last.mesReferencia),
    unidadesCrasNoMes: rows.length,
    totaisMunicipio: {
      a1: sum("a1"),
      c1: sum("c1"),
      c2: sum("c2"),
      c3: sum("c3"),
      c6: sum("c6")
    }
  };
}

export async function resumoRmaCreasPorIbge(codigoIbge) {
  const ibge = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  const last = await prisma.rmaCreasRegistroMensal.findFirst({
    where: { codigoIbge: ibge },
    orderBy: { mesReferencia: "desc" }
  });
  if (!last) return null;
  const rows = await prisma.rmaCreasRegistroMensal.findMany({
    where: { codigoIbge: ibge, mesReferencia: last.mesReferencia }
  });
  return {
    painel: "RMA CREAS",
    mesReferencia: last.mesReferencia,
    mesLabel: mesRefLabel(last.mesReferencia),
    unidadesNoMes: rows.length,
    totaisMunicipio: {
      a1: sumMetricasRows(rows, "a1"),
      a2: sumMetricasRows(rows, "a2"),
      m1: sumMetricasRows(rows, "m1"),
      m4: sumMetricasRows(rows, "m4")
    }
  };
}

export async function resumoRmaPopPorIbge(codigoIbge) {
  const ibge = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  const last = await prisma.rmaPopRegistroMensal.findFirst({
    where: { codigoIbge: ibge },
    orderBy: { mesReferencia: "desc" }
  });
  if (!last) return null;
  const rows = await prisma.rmaPopRegistroMensal.findMany({
    where: { codigoIbge: ibge, mesReferencia: last.mesReferencia }
  });
  return {
    painel: "RMA Centro POP",
    mesReferencia: last.mesReferencia,
    mesLabel: mesRefLabel(last.mesReferencia),
    unidadesNoMes: rows.length,
    totaisMunicipio: {
      a1: sumMetricasRows(rows, "a1"),
      d1: sumMetricasRows(rows, "d1"),
      e1: sumMetricasRows(rows, "e1"),
      c1: sumMetricasRows(rows, "c1"),
      c2: sumMetricasRows(rows, "c2")
    }
  };
}

function pctDoTotal(parte, total) {
  const p = Number(parte);
  const t = Number(total);
  if (!t || t <= 0 || Number.isNaN(p)) return null;
  return ((100 * p) / t).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function textoSecaoCardsPainel(titulo, cards) {
  if (!cards) return "";
  const c = cards;
  const tp = Number(c.totalPessoas) || 0;
  const tf = Number(c.totalFamilias) || 0;
  const linhas = [
    titulo,
    `  Familias (neste recorte): ${c.totalFamilias}; Pessoas: ${c.totalPessoas}.`,
    `  Sexo — Homens: ${c.totalHomens}${pctDoTotal(c.totalHomens, tp) != null ? ` (${pctDoTotal(c.totalHomens, tp)}% do total de pessoas)` : ""}; Mulheres: ${c.totalMulheres}${pctDoTotal(c.totalMulheres, tp) != null ? ` (${pctDoTotal(c.totalMulheres, tp)}%)` : ""}.`,
    `  Faixas etarias: 0-6 ${c.primeiraInfancia}; 7-14 ${c.criancasAdolescentes}; 15-17 ${c.adolescentes}; 18-29 ${c.jovens}; 30-59 ${c.adultos}; 60+ ${c.idosos}.`,
    `  Pessoas com deficiencia: ${c.pessoasComDeficiencia}${pctDoTotal(c.pessoasComDeficiencia, tp) != null ? ` (${pctDoTotal(c.pessoasComDeficiencia, tp)}%)` : ""} — visual ${c.defVisual}; auditiva ${c.defAuditiva}; fisica ${c.defFisica}; intelectual ${c.defIntelectual}; mental ${c.defMental}.`,
    `  BPC (cruzamento CadU): com BPC ${c.pessoasComBpc}${pctDoTotal(c.pessoasComBpc, tp) != null ? ` (${pctDoTotal(c.pessoasComBpc, tp)}%)` : ""}; BPC idoso ${c.pessoasBpcIdoso}; BPC deficiencia ${c.pessoasBpcDeficiencia}.`,
    `  Renda familiar (per capita): pobreza ate 1/4 SM ${c.familiasPobreza}${pctDoTotal(c.familiasPobreza, tf) != null ? ` (${pctDoTotal(c.familiasPobreza, tf)}% das familias)` : ""}; baixa renda (ate meio SM) ${c.familiasBaixaRenda}${pctDoTotal(c.familiasBaixaRenda, tf) != null ? ` (${pctDoTotal(c.familiasBaixaRenda, tf)}%)` : ""}; acima meio SM ${c.familiasAcimaMeioSalario}${pctDoTotal(c.familiasAcimaMeioSalario, tf) != null ? ` (${pctDoTotal(c.familiasAcimaMeioSalario, tf)}%)` : ""}; com PBF ${c.familiasComPbf}${pctDoTotal(c.familiasComPbf, tf) != null ? ` (${pctDoTotal(c.familiasComPbf, tf)}%)` : ""}; risco violacao direitos ${c.familiasRiscoViolacao}; inseguranca alimentar ${c.familiasInsegurancaAlimentar}${pctDoTotal(c.familiasInsegurancaAlimentar, tf) != null ? ` (${pctDoTotal(c.familiasInsegurancaAlimentar, tf)}%)` : ""}.`,
    `  Populacoes prioritarias: trabalho infantil ${c.pessoasTrabalhoInfantil}; situacao de rua ${c.pessoasSituacaoRua}; criancas 7-15 fora da escola ${c.criancasForaEscola}; adultos baixa escolaridade ${c.adultosBaixaEscolaridade}.`
  ];
  return linhas.join("\n");
}

/**
 * Painel CADU (views vw_vig_*) municipal + por unidade territorial (CRAS), mais status de importacao.
 * Base unica do municipio em contexto.
 */
export async function obterPainelCadVigilanciaCompleto() {
  const [caduImport, bpcImport] = await Promise.all([
    getCaduImportStatusSnapshot().catch(() => null),
    getBpcImportStatusSnapshot().catch(() => null)
  ]);

  const out = {
    caduImport,
    bpcImport,
    municipal: null,
    porCras: [],
    aviso: null
  };

  try {
    out.municipal = await getVigilanciaOverviewCards("TODOS", []);
    const unidades = await listarUnidadesTerritoriaisVigilancia();
    const slice = unidades.slice(0, MAX_UNIDADES_CRAS_PAINEL);
    for (const u of slice) {
      const { cards } = await getVigilanciaOverviewCards(u.codigo, []);
      out.porCras.push({ codigo: u.codigo, nome: u.nome, cards });
    }
    if (unidades.length > MAX_UNIDADES_CRAS_PAINEL) {
      out.aviso = `Listagem por CRAS limitada a ${MAX_UNIDADES_CRAS_PAINEL} unidades (${unidades.length} encontradas).`;
    }
  } catch (e) {
    out.aviso =
      e?.message ||
      "Falha ao consultar views de vigilancia (vw_vig_*). Atualize as bases no painel Vigilancia.";
    console.error("obterPainelCadVigilanciaCompleto:", e);
  }

  return out;
}

/**
 * Monta texto longo para o assistente: IBGE + populacao + painel CADU (municipio + CRAS) + RMA.
 */
export function montarTextoComparativoCompleto({
  textoTerritorialIbge,
  painelCadVigilancia,
  rmaCras,
  rmaCreas,
  rmaPop
}) {
  const blocos = [];
  blocos.push("=== CONTEXTO PARA COMPARATIVO (IBGE x CADU x RMA) ===");
  blocos.push("");
  blocos.push("--- Divisoes territoriais e populacao (IBGE) ---");
  blocos.push(textoTerritorialIbge || "");
  blocos.push(
    "(Populacao Censo 2022 acima, quando presente, serve como denominador aproximado para taxas com CadUnico e RMA.)"
  );

  const p = painelCadVigilancia;
  if (p?.caduImport) {
    const ci = p.caduImport;
    blocos.push("");
    blocos.push("--- Cadastro Unico (importacao — base unica do municipio) ---");
    blocos.push(
      `Linhas brutas (pessoas): ${Number(ci.totalPessoas || 0).toLocaleString("pt-BR")}; familias na base: ${Number(ci.totalFamilias || 0).toLocaleString("pt-BR")}.`
    );
    blocos.push(
      `Familias com Bolsa Familia: ${Number(ci.familiasComBolsa || 0).toLocaleString("pt-BR")}; atualizacao cadastral (ultimos ${CADU_MESES_ATUALIZACAO} meses): ${ci.percentualAtualizacaoCadastral || "0%"}.`
    );
    if (ci.ultimoUpload?.nomeArquivo) {
      blocos.push(`Ultimo arquivo importado: ${ci.ultimoUpload.nomeArquivo}.`);
    }
  } else {
    blocos.push("");
    blocos.push("--- Cadastro Unico (importacao) ---");
    blocos.push("Sem dados de status de importacao disponiveis.");
  }

  if (p?.bpcImport) {
    const bi = p.bpcImport;
    blocos.push("");
    blocos.push("--- BPC (importacao — base unica do municipio) ---");
    blocos.push(
      `Total de registros: ${Number(bi.total || 0).toLocaleString("pt-BR")}; idosos: ${Number(bi.idosos || 0).toLocaleString("pt-BR")}; deficientes: ${Number(bi.deficientes || 0).toLocaleString("pt-BR")}.`
    );
    if (bi.competenciaReferencia) {
      blocos.push(`Competencia de referencia (ultimo upload): ${bi.competenciaReferencia}.`);
    }
  }

  if (p?.municipal?.cards) {
    blocos.push("");
    blocos.push(
      textoSecaoCardsPainel(
        "--- Painel de vigilancia CADU — municipio inteiro (unidade TODOS; views vw_vig_*) ---",
        p.municipal.cards
      )
    );
  } else {
    blocos.push("");
    blocos.push("--- Painel de vigilancia CADU (municipio) ---");
    blocos.push(
      p?.aviso ||
        "Visao municipal indisponivel (views nao encontradas ou nao atualizadas)."
    );
  }

  if (Array.isArray(p?.porCras) && p.porCras.length > 0) {
    blocos.push("");
    blocos.push("--- Mesmo painel, recortado por unidade territorial (CRAS) ---");
    for (const u of p.porCras) {
      blocos.push("");
      blocos.push(
        textoSecaoCardsPainel(
          `Unidade ${u.nome} (codigo ${u.codigo})`,
          u.cards
        )
      );
    }
  }

  if (p?.aviso && p.municipal?.cards) {
    blocos.push("");
    blocos.push(`Aviso painel: ${p.aviso}`);
  }

  const pushRma = (titulo, r) => {
    if (!r) return;
    blocos.push("");
    blocos.push(`--- ${titulo} (ultimo mes no sistema: ${r.mesLabel}) ---`);
    blocos.push(`Unidades no recorte: ${r.unidadesCrasNoMes ?? r.unidadesNoMes}.`);
    blocos.push(`Totais municipais agregados: ${JSON.stringify(r.totaisMunicipio)}`);
    blocos.push(
      "Interpretacao: valores sao producao do SUAS no periodo (atendido/registrado), nao populacao total."
    );
  };

  pushRma("RMA CRAS", rmaCras);
  pushRma("RMA CREAS", rmaCreas);
  pushRma("RMA Centro POP", rmaPop);

  blocos.push("");
  blocos.push("--- Como comparar (orientacao analitica) ---");
  blocos.push(
    "- IBGE Censo 2022: populacao residente (universo demografico)."
  );
  blocos.push(
    "- CadUnico (painel): mesma base importada do municipio; recorte por CRAS segue codigo de unidade territorial no CadU; nao confunda com distrito IBGE."
  );
  blocos.push(
    "- RMA: volume de atendimentos/registros SUAS no mes (producao), comparavel entre si e com a populacao apenas via taxas aproximadas."
  );
  blocos.push(
    "Nao confunda distrito administrativo IBGE com area do CRAS; nao atribua causas sem dados suficientes."
  );

  return blocos.join("\n");
}

export async function obterComparativoCompletoParaSync({ codigoIbge }) {
  const cod = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  const [painelCadVigilancia, rmaCras, rmaCreas, rmaPop] = await Promise.all([
    obterPainelCadVigilanciaCompleto(),
    resumoRmaCrasPorIbge(cod),
    resumoRmaCreasPorIbge(cod),
    resumoRmaPopPorIbge(cod)
  ]);

  return {
    painelCadVigilancia,
    rmaCras,
    rmaCreas,
    rmaPop
  };
}
