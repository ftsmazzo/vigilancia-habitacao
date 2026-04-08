import { prisma } from "../utils/prisma.js";

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

/**
 * Monta texto longo para o assistente: IBGE + populacao + CadU + RMA + comparativo.
 */
export function montarTextoComparativoCompleto({
  textoTerritorialIbge,
  cadu,
  bpc,
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

  if (cadu && (cadu.familiasCadastradas > 0 || cadu.pessoasVinculadasFamilias > 0)) {
    blocos.push("");
    blocos.push("--- Cadastro Unico (base interna importada) ---");
    blocos.push(
      `Familias no recorte municipal (campo municipio): ${cadu.familiasCadastradas.toLocaleString("pt-BR")}.`
    );
    blocos.push(
      `Pessoas vinculadas a essas familias: ${cadu.pessoasVinculadasFamilias.toLocaleString("pt-BR")}.`
    );
    blocos.push(`Observacao: ${cadu.criterio}`);
  } else {
    blocos.push("");
    blocos.push("--- Cadastro Unico (base interna) ---");
    blocos.push(
      "Sem familias encontradas para este nome de municipio no cadastro importado, ou importacao ausente."
    );
  }

  if (bpc?.beneficiariosBpc != null && bpc.beneficiariosBpc > 0) {
    blocos.push("");
    blocos.push("--- BPC (base interna importada) ---");
    blocos.push(
      `Registros de beneficiarios com municipio compativel: ${bpc.beneficiariosBpc.toLocaleString("pt-BR")}.`
    );
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
    "- CadUnico: pessoas/familias vulneraveis cadastradas no recorte importado (ordem de grandeza; depende da qualidade do campo municipio)."
  );
  blocos.push(
    "- RMA: volume de atendimentos/registros SUAS no mes (producao), comparavel entre si e com a populacao apenas via taxas aproximadas."
  );
  blocos.push(
    "Nao confunda distrito administrativo IBGE com area do CRAS; nao atribua causas sem dados suficientes."
  );

  return blocos.join("\n");
}

export async function obterComparativoCompletoParaSync({ codigoIbge, nomeMunicipio, uf }) {
  const cod = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  const [cadu, bpc, rmaCras, rmaCreas, rmaPop] = await Promise.all([
    resumoCadunicoPorMunicipio(nomeMunicipio),
    resumoBpcPorMunicipio(nomeMunicipio, uf),
    resumoRmaCrasPorIbge(cod),
    resumoRmaCreasPorIbge(cod),
    resumoRmaPopPorIbge(cod)
  ]);

  return {
    cadu,
    bpc,
    rmaCras,
    rmaCreas,
    rmaPop
  };
}
