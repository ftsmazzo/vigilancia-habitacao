/**
 * Busca dados municipais na API publica do IBGE (localidades + divisoes).
 * Documentacao: https://servicodados.ibge.gov.br/api/docs/localidades
 */

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

  const localidade = extrairLocalidadeParaContexto(raw);
  const listaDistritos = distritos
    .slice(0, 80)
    .map((x) => ({ id: x.id, nome: x.nome }))
    .filter((x) => x.nome);

  const textoNarrativo = montarTextoNarrativoIbge({
    localidade,
    distritos: listaDistritos
  });

  return {
    versao: 2,
    fonte: "IBGE — API de localidades (dados publicos)",
    municipioId: raw.id,
    localidade,
    divisoesTerritoriais: {
      quantidadeDistritos: distritos.length,
      distritos: listaDistritos
    },
    /** Paragrafo pronto para injetar no prompt do assistente. */
    textoContextoAssistente: textoNarrativo,
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

function montarTextoNarrativoIbge({ localidade, distritos }) {
  if (!localidade?.nome) return "";
  const linhas = [];
  linhas.push(
    `Municipio ${localidade.nome} (${localidade.uf}), codigo IBGE ${localidade.id}.`
  );
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
  linhas.push(
    "Use esta hierarquia territorial para contextualizar escala, articulacao regional e referencias espaciais; nao confunda com limites da assistencia social ou da gestao SUAS."
  );
  return linhas.join("\n");
}

/** Reduz payload bruto legado para objeto simples (compat). */
export function normalizeIbgeMunicipio(data) {
  return extrairLocalidadeParaContexto(data);
}
