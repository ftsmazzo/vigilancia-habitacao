/**
 * Indicadores municipais via API de agregados do IBGE (mesma base estatistica do portal Cidades@).
 * Usa apenas series que respondem de forma estavel na API publica; valores derivados sao calculados
 * (ex.: PIB per capita = PIB em reais / populacao de referencia).
 * @see https://servicodados.ibge.gov.br/api/docs/agregados
 */

const AGG_BASE = "https://servicodados.ibge.gov.br/api/v3/agregados";

function parseNumeroIbge(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s || s === "-" || /^sem\s*dados$/i.test(s)) return null;
  const normalized = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function extrairValorSerieAgregados(data) {
  if (!Array.isArray(data) || !data[0]) return null;
  const serie = data[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!serie || typeof serie !== "object") return null;
  const keys = Object.keys(serie).sort();
  if (!keys.length) return null;
  const ultimaChave = keys[keys.length - 1];
  return { valorBruto: serie[ultimaChave], periodo: ultimaChave };
}

async function fetchAgregadoVariavel(tabela, periodo, variavel, codigoIbge) {
  const id = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  const url = `${AGG_BASE}/${tabela}/periodos/${periodo}/variaveis/${variavel}?localidades=N6%5B${id}%5D`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 22000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ac.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.statusCode) return null;
    const ext = extrairValorSerieAgregados(data);
    if (!ext) return null;
    const nomeVar = data[0]?.variavel;
    const unidade = data[0]?.unidade;
    const n = parseNumeroIbge(ext.valorBruto);
    return {
      valor: n,
      valorBruto: ext.valorBruto,
      periodo: String(ext.periodo),
      tabela: String(tabela),
      variavel: String(variavel),
      nomeVariavel: nomeVar,
      unidade
    };
  } catch (e) {
    console.warn(`IBGE agregado ${tabela}/${variavel}:`, e?.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchComPeriodos(tabela, variavel, periodos, codigoIbge) {
  for (const periodo of periodos) {
    const r = await fetchAgregadoVariavel(tabela, periodo, variavel, codigoIbge);
    if (r?.valor != null || r?.valorBruto != null) return r;
  }
  return null;
}

/**
 * @param {object|null} populacaoCenso2022Ref - retorno de fetchIbgePopulacaoCenso2022 (evita import circular).
 */
export async function fetchIbgeIndicadoresCidadesResumo(
  codigoIbge,
  populacaoCenso2022Ref = null
) {
  const id = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");

  const [populacaoEstimada, pibTotalMilReais] = await Promise.all([
    fetchComPeriodos(
      "6579",
      "9324",
      ["2025", "2024", "2023", "2022"],
      id
    ),
    fetchComPeriodos("5938", "37", ["2023", "2022", "2021"], id)
  ]);

  const anoPib = pibTotalMilReais?.periodo
    ? Number(String(pibTotalMilReais.periodo).slice(0, 4))
    : null;

  /** Serie 6579 nem sempre tem todos os anos; tenta ano do PIB e vizinhos. */
  let populacaoParaDenominador = null;
  if (anoPib && Number.isFinite(anoPib)) {
    const candidatos = [
      anoPib,
      anoPib + 1,
      anoPib - 1,
      2025,
      2024,
      2022
    ].filter((x, i, a) => a.indexOf(x) === i);
    for (const ano of candidatos) {
      if (ano < 2000 || ano > 2030) continue;
      const p = await fetchAgregadoVariavel(
        "6579",
        String(ano),
        "9324",
        id
      );
      if (p?.valor != null) {
        populacaoParaDenominador = p;
        break;
      }
    }
  }

  const popRef =
    populacaoParaDenominador?.valor != null
      ? populacaoParaDenominador
      : populacaoEstimada?.valor != null
      ? populacaoEstimada
      : populacaoCenso2022Ref?.valor != null
      ? {
          valor: populacaoCenso2022Ref.valor,
          periodo: "2022",
          nomeVariavel: "Populacao residente (Censo 2022 — fallback)",
          tabela: populacaoCenso2022Ref.tabela || "9514"
        }
      : null;

  /**
   * Portal Cidades costuma exibir PIB per capita do ano do PIB com denominador
   * compativel (muitas fichas usam pop. residente do Censo mais recente como base).
   */
  const popDenominadorPibPerCapita =
    populacaoCenso2022Ref?.valor != null
      ? {
          valor: populacaoCenso2022Ref.valor,
          periodo: "2022",
          tabela: populacaoCenso2022Ref.tabela || "9514",
          nomeVariavel:
            "Populacao residente Censo 2022 (denominador para PIB per capita, alinhado ao recorte usual do IBGE/Cidades)"
        }
      : popRef;

  let pibPerCapitaReais = null;
  if (pibTotalMilReais?.valor != null && popDenominadorPibPerCapita?.valor > 0) {
    const pibReais = pibTotalMilReais.valor * 1000;
    pibPerCapitaReais = pibReais / popDenominadorPibPerCapita.valor;
  }

  return {
    populacaoCenso2022: populacaoCenso2022Ref
      ? {
          valor: populacaoCenso2022Ref.valor,
          periodo: "2022",
          tabela: populacaoCenso2022Ref.tabela
        }
      : null,
    populacaoEstimada,
    populacaoReferenciaPib: popDenominadorPibPerCapita,
    pibTotalMilReais,
    pibPerCapitaReaisCalculado: pibPerCapitaReais
      ? {
          valor: pibPerCapitaReais,
          nota:
            "PIB a precos correntes (tabela 5938, var. 37, mil reais -> reais) / populacao residente Censo 2022 quando disponivel; senao estimativa 6579."
        }
      : null,
    fonte:
      "IBGE API agregados: 6579 (estimativas de populacao), 5938 (PIB dos municipios), 9514 (Censo populacao quando aplicavel)."
  };
}

export function montarTextoIndicadoresCidadesIbge(ind) {
  if (!ind || typeof ind !== "object") return "";
  const linhas = [];
  linhas.push(
    "--- Indicadores IBGE (API publica — referencia estatistica tipo portal Cidades) ---"
  );

  if (ind.populacaoEstimada?.valorBruto != null || ind.populacaoEstimada?.valor != null) {
    const v =
      ind.populacaoEstimada.valor != null
        ? Number(ind.populacaoEstimada.valor).toLocaleString("pt-BR")
        : String(ind.populacaoEstimada.valorBruto);
    linhas.push(
      `Populacao estimada [${ind.populacaoEstimada.periodo}]: ${v} pessoas (tabela ${ind.populacaoEstimada.tabela}).`
    );
  }

  if (ind.pibTotalMilReais?.valor != null) {
    const mil = Number(ind.pibTotalMilReais.valor).toLocaleString("pt-BR");
    linhas.push(
      `PIB a precos correntes [${ind.pibTotalMilReais.periodo}]: ${mil} mil reais (tabela ${ind.pibTotalMilReais.tabela}, ${ind.pibTotalMilReais.nomeVariavel || "var. 37"}).`
    );
  }

  if (ind.pibPerCapitaReaisCalculado?.valor != null) {
    linhas.push(
      `PIB per capita aproximado (PIB em reais / populacao de referencia): R$ ${ind.pibPerCapitaReaisCalculado.valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}.`
    );
    if (ind.populacaoReferenciaPib?.valor) {
      linhas.push(
        `Populacao usada no denominador: ${Number(ind.populacaoReferenciaPib.valor).toLocaleString("pt-BR")} (${ind.populacaoReferenciaPib.periodo}).`
      );
    }
  }

  linhas.push(
    "Nota: gentilico, data de aniversario e nome do prefeito no portal Cidades costumam vir de cadastros proprios do aplicativo; aqui usamos apenas series numericas oficiais do IBGE."
  );

  return linhas.join("\n");
}
