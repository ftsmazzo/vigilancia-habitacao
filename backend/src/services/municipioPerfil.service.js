import { prisma } from "../utils/prisma.js";

/**
 * Municipio ativo: MUNICIPIO_IBGE_CODIGO no .env; senao o primeiro cadastro (mais recente).
 */
export async function getMunicipioPerfilAtivo() {
  const codigoEnv = process.env.MUNICIPIO_IBGE_CODIGO?.trim();
  if (codigoEnv) {
    const id = codigoEnv.replace(/\D/g, "").padStart(7, "0");
    const porCodigo = await prisma.municipioPerfil.findUnique({
      where: { codigoIbge: id }
    });
    if (porCodigo) return porCodigo;
  }
  return prisma.municipioPerfil.findFirst({
    orderBy: { atualizadoEm: "desc" }
  });
}

export function resumoMunicipioParaRag(perfil) {
  if (!perfil) return "";
  const d =
    perfil.dadosJson && typeof perfil.dadosJson === "object"
      ? perfil.dadosJson
      : {};
  const partes = [
    `Municipio em foco: ${perfil.nome} (${perfil.uf}), codigo IBGE ${perfil.codigoIbge}.`
  ];
  const equip = [];
  if (d.qtdCras != null) equip.push(`${d.qtdCras} CRAS`);
  if (d.qtdCreas != null) equip.push(`${d.qtdCreas} CREAS`);
  if (d.qtdCentroPop != null) equip.push(`${d.qtdCentroPop} Centro(s) POP`);
  if (d.qtdMse != null) equip.push(`${d.qtdMse} MSE`);
  if (equip.length) partes.push(`Rede SUAS (equipamentos informados): ${equip.join(", ")}.`);
  if (d.populacao != null) {
    partes.push(
      `Populacao referencia: ${d.populacao}${d.anoPopulacao ? ` (${d.anoPopulacao})` : ""}.`
    );
  }
  return partes.join(" ");
}

/**
 * Texto para o prompt principal do assistente (sem truncar demais o texto livre).
 */
export function formatMunicipioPerfilForPrompt(perfil) {
  if (!perfil) {
    return "(Nenhum perfil municipal configurado no sistema. Evite supor dados locais especificos; use apenas o que vier no pedido, no RMA e na base normativa.)";
  }
  const d =
    perfil.dadosJson && typeof perfil.dadosJson === "object"
      ? perfil.dadosJson
      : {};
  const blocos = [];

  blocos.push(
    `Identificacao: ${perfil.nome} / ${perfil.uf} — IBGE ${perfil.codigoIbge}.`
  );

  if (perfil.textoMunicipio?.trim()) {
    blocos.push(
      `Sintese territorial e institucional (priorize para contextualizar respostas):\n${perfil.textoMunicipio.trim().slice(0, 8000)}`
    );
  }

  const dadosUteis = { ...d };
  delete dadosUteis._raw;
  if (Object.keys(dadosUteis).length > 0) {
    blocos.push(
      `Dados cadastrados (estruturados):\n${JSON.stringify(dadosUteis, null, 2).slice(0, 12000)}`
    );
  }

  if (perfil.ibgeCacheJson && typeof perfil.ibgeCacheJson === "object") {
    blocos.push(
      `Dados de referencia IBGE (localidade):\n${JSON.stringify(perfil.ibgeCacheJson, null, 2).slice(0, 4000)}`
    );
  }

  return blocos.join("\n\n").slice(0, 20000);
}
