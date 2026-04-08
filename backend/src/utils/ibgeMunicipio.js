/**
 * Busca dados municipais na API publica do IBGE (localidades).
 * Documentacao: https://servicodados.ibge.gov.br/api/docs/localidades
 */

export async function fetchIbgeMunicipioPorCodigo(codigoIbge) {
  const id = String(codigoIbge).replace(/\D/g, "").padStart(7, "0");
  if (id.length !== 7) {
    throw new Error("codigoIbge deve ter 7 digitos");
  }
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${id}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`IBGE retornou HTTP ${res.status}`);
  }
  const data = await res.json();
  return normalizeIbgeMunicipio(data);
}

/** Reduz o payload bruto para um objeto util ao prompt. */
export function normalizeIbgeMunicipio(data) {
  if (!data || typeof data !== "object") return null;
  const uf = data.microrregiao?.mesorregiao?.UF?.sigla || data.uf?.sigla;
  const nomeUf = data.microrregiao?.mesorregiao?.UF?.nome || data.uf?.nome;
  return {
    id: data.id,
    nome: data.nome,
    uf: uf,
    nomeUf: nomeUf,
    microrregiao: data.microrregiao?.nome,
    mesorregiao: data.microrregiao?.mesorregiao?.nome,
    regiao: data.microrregiao?.mesorregiao?.UF?.regiao?.nome
  };
}
