/**
 * Integracao com a API publica de Localidades do IBGE.
 *
 * Indice geral das APIs: https://servicodados.ibge.gov.br/api/docs
 *
 * Estrategia de coleta (eficiente para o assistente):
 * 1) Localidades v1 — lista por UF, municipio por id, distritos (ja usamos).
 * 2) Agregados SIDRA — populacao estimada (6579), PIB municipal (5938), Censo pop (9514);
 *    ver `ibgeIndicadoresSidra.js` (mesma logica estatistica do portal Cidades@, via API).
 * 3) Sincronizacao `fetchIbgeContextoMunicipio` — texto + JSON para o prompt.
 * 4) Malhas geograficas — outro servico, para mapas; nao necessario ao texto do assistente.
 */

import {
  fetchIbgeIndicadoresCidadesResumo,
  montarTextoIndicadoresCidadesIbge
} from "./ibgeIndicadoresSidra.js";

const IBGE_BASE = "https://servicodados.ibge.gov.br/api/v1/localidades";

async function fetchJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ac.signal
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    throw new Error(`IBGE retornou HTTP ${res.status} (${url})`);
  }
  return res.json();
}

/**
 * Populacao residente Censo 2022 (municipio) — tabela 9514, variavel 93.
 * @see https://servicodados.ibge.gov.br/api/docs/agregados
 */
export async function fetchIbgePopulacaoCenso2022(codigoIbge) {
  const id = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  const url = `https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/2022/variaveis/93?localidades=N6%5B${id}%5D`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ac.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;
    const serie = data[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (!serie || typeof serie !== "object") return null;
    const valor = serie["2022"] ?? serie[Object.keys(serie)[0]];
    if (valor == null) return null;
    const n = Number(String(valor).replace(/\D/g, ""));
    if (Number.isNaN(n)) return null;
    return {
      valor: n,
      variavel: data[0]?.variavel || "Populacao residente",
      tabela: "9514",
      periodo: "2022"
    };
  } catch (e) {
    console.warn("IBGE populacao Censo 2022:", e?.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Lista municipios de uma UF (para selects / validacao de codigo).
 * GET .../estados/{UF}/municipios
 */
export async function fetchMunicipiosPorUf(uf) {
  const sigla = String(uf ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!/^[A-Z]{2}$/.test(sigla)) {
    throw new Error("UF invalida (use 2 letras, ex.: SP)");
  }
  const data = await fetchJson(`${IBGE_BASE}/estados/${sigla}/municipios`);
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => ({ id: m.id, nome: m.nome }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

/**
 * Retorno completo para gravar em ibgeCacheJson e usar como contexto do assistente.
 */
export async function fetchIbgeContextoMunicipio(codigoIbge) {
  const id = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  if (id.length !== 7) {
    throw new Error("codigoIbge deve ter 7 digitos");
  }

  const urlMun = `${IBGE_BASE}/municipios/${id}`;
  const raw = await fetchJson(urlMun);

  let distritos = [];
  try {
    const d = await fetchJson(`${IBGE_BASE}/municipios/${id}/distritos`);
    distritos = Array.isArray(d) ? d : [];
  } catch (e) {
    console.warn("IBGE distritos:", e?.message || e);
  }

  let subdistritos = [];
  try {
    const s = await fetchJson(`${IBGE_BASE}/municipios/${id}/subdistritos`);
    subdistritos = Array.isArray(s) ? s : [];
  } catch (e) {
    console.warn("IBGE subdistritos:", e?.message || e);
  }

  const populacaoCenso2022 = await fetchIbgePopulacaoCenso2022(id);

  let indicadoresCidades = null;
  let textoIndicadoresCidades = "";
  try {
    indicadoresCidades = await fetchIbgeIndicadoresCidadesResumo(
      id,
      populacaoCenso2022
    );
    textoIndicadoresCidades = montarTextoIndicadoresCidadesIbge(
      indicadoresCidades
    ).trim();
  } catch (e) {
    console.warn("IBGE indicadores Cidades (SIDRA):", e?.message || e);
  }

  const localidade = extrairLocalidadeParaContexto(raw);
  const listaDistritos = distritos
    .slice(0, 80)
    .map((x) => ({ id: x.id, nome: x.nome }))
    .filter((x) => x.nome);

  const listaSubdistritos = subdistritos
    .slice(0, 40)
    .map((x) => ({ id: x.id, nome: x.nome }))
    .filter((x) => x.nome);

  const textoTerritorialBase = montarTextoNarrativoIbge({
    localidade,
    distritos: listaDistritos,
    subdistritos: listaSubdistritos,
    populacaoCenso2022
  });

  const textoTerritorial = [textoTerritorialBase, textoIndicadoresCidades]
    .filter(Boolean)
    .join("\n\n");

  return {
    versao: 4,
    fonte:
      "IBGE — Localidades + agregados (Censo 2022, estimativas populacao, area, PIB, IDHM — API publica)",
    municipioId: raw.id,
    localidade,
    populacaoCenso2022,
    indicadoresCidades,
    divisoesTerritoriais: {
      quantidadeDistritos: distritos.length,
      distritos: listaDistritos,
      quantidadeSubdistritos: subdistritos.length,
      subdistritos: listaSubdistritos
    },
    /** Texto territorial + populacao IBGE; o route acrescenta CADU/RMA. */
    textoTerritorial,
    textoContextoAssistente: textoTerritorial,
    atualizadoEm: new Date().toISOString()
  };
}

/** Compatibilidade: chamada antiga que devolvia so o objeto normalizado. */
export async function fetchIbgeMunicipioPorCodigo(codigoIbge) {
  const ctx = await fetchIbgeContextoMunicipio(codigoIbge);
  return ctx.localidade;
}

function extrairLocalidadeParaContexto(data) {
  if (!data || typeof data !== "object") return null;
  const uf = data.microrregiao?.mesorregiao?.UF?.sigla;
  const nomeUf = data.microrregiao?.mesorregiao?.UF?.nome;
  const ri = data["regiao-imediata"];
  const riNome = ri?.nome;
  const rint = ri?.["regiao-intermediaria"];
  return {
    id: data.id,
    nome: data.nome,
    uf,
    nomeUf,
    microrregiao: data.microrregiao?.nome,
    mesorregiao: data.microrregiao?.mesorregiao?.nome,
    regiaoBrasil: data.microrregiao?.mesorregiao?.UF?.regiao?.nome,
    regiaoImediata: riNome
      ? { id: ri?.id, nome: riNome }
      : undefined,
    regiaoIntermediaria: rint?.nome
      ? { id: rint?.id, nome: rint.nome }
      : undefined
  };
}

function montarTextoNarrativoIbge({ localidade, distritos, subdistritos, populacaoCenso2022 }) {
  if (!localidade?.nome) return "";
  const linhas = [];
  linhas.push(
    `Municipio ${localidade.nome} (${localidade.uf}), codigo IBGE ${localidade.id}.`
  );
  if (populacaoCenso2022?.valor != null) {
    linhas.push(
      `Populacao residente Censo Demografico 2022 (IBGE): ${Number(populacaoCenso2022.valor).toLocaleString("pt-BR")} pessoas (tabela ${populacaoCenso2022.tabela}, variavel populacao residente).`
    );
  }
  if (localidade.mesorregiao) {
    linhas.push(`Mesorregiao geografica: ${localidade.mesorregiao}.`);
  }
  if (localidade.microrregiao) {
    linhas.push(`Microrregiao: ${localidade.microrregiao}.`);
  }
  if (localidade.regiaoBrasil) {
    linhas.push(`Regiao do Brasil: ${localidade.regiaoBrasil}.`);
  }
  if (localidade.regiaoIntermediaria?.nome) {
    linhas.push(`Regiao geografica intermediaria: ${localidade.regiaoIntermediaria.nome}.`);
  }
  if (localidade.regiaoImediata?.nome) {
    linhas.push(`Regiao geografica imediata (aglomeracao): ${localidade.regiaoImediata.nome}.`);
  }
  if (distritos?.length) {
    const nomes = distritos.map((d) => d.nome).filter(Boolean);
    const amostra = nomes.slice(0, 15).join(", ");
    const resto = nomes.length > 15 ? ` e mais ${nomes.length - 15} distrito(s)` : "";
    linhas.push(
      `Divisao em ${distritos.length} distrito(s) administrativo(s) cadastrado(s) pelo IBGE (exemplos: ${amostra}${resto}).`
    );
  }
  if (subdistritos?.length) {
    const nomes = subdistritos.map((d) => d.nome).filter(Boolean);
    const amostra = nomes.slice(0, 12).join(", ");
    linhas.push(
      `Subdistritos cadastrados pelo IBGE: ${subdistritos.length} (exemplos: ${amostra}${nomes.length > 12 ? "..." : ""}).`
    );
  }
  linhas.push(
    "Use esta hierarquia territorial para contextualizar escala, articulacao regional e referencias espaciais; nao confunda com limites da assistencia social ou da gestao SUAS."
  );
  return linhas.join("\n");
}

/** Reduz payload bruto legado para objeto simples (compat). */
export function normalizeIbgeMunicipio(data) {
  return extrairLocalidadeParaContexto(data);
}
