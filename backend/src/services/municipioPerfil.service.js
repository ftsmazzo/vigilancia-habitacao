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
  const ibge = perfil.ibgeCacheJson;
  if (ibge && typeof ibge === "object") {
    const loc = ibge.localidade;
    if (loc?.mesorregiao) {
      partes.push(`Mesorregiao (IBGE): ${loc.mesorregiao}.`);
    }
    if (loc?.regiaoImediata?.nome) {
      partes.push(`Regiao geografica imediata (IBGE): ${loc.regiaoImediata.nome}.`);
    }
    if (ibge.divisoesTerritoriais?.quantidadeDistritos != null) {
      partes.push(
        `Distritos administrativos (IBGE): ${ibge.divisoesTerritoriais.quantidadeDistritos}.`
      );
    }
    if (ibge.populacaoCenso2022?.valor != null) {
      partes.push(
        `Populacao Censo 2022 (IBGE): ${ibge.populacaoCenso2022.valor}.`
      );
    }
    const comp = ibge.comparativoCadRmaIbge;
    if (comp?.cadu?.familiasCadastradas != null) {
      partes.push(`CadUnico (import): ${comp.cadu.familiasCadastradas} familias.`);
    }
    if (comp?.rmaCras?.totaisMunicipio?.c1 != null) {
      partes.push(`RMA CRAS C.1 (ultimo mes sistema): ${comp.rmaCras.totaisMunicipio.c1}.`);
    }
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

  if (perfil.ibgeCacheJson && typeof perfil.ibgeCacheJson === "object") {
    const ibge = perfil.ibgeCacheJson;
    if (ibge.textoContextoAssistente && String(ibge.textoContextoAssistente).trim()) {
      blocos.push(
        `### Contexto territorial (IBGE — obtido pela sincronizacao)\n${String(ibge.textoContextoAssistente).trim().slice(0, 6000)}`
      );
    }
    if ((ibge.versao === 2 || ibge.versao === 3) && ibge.localidade) {
      const resumoDiv = ibge.divisoesTerritoriais;
      const extra = {
        localidade: ibge.localidade,
        populacaoCenso2022: ibge.populacaoCenso2022,
        quantidadeDistritos: resumoDiv?.quantidadeDistritos,
        quantidadeSubdistritos: resumoDiv?.quantidadeSubdistritos,
        amostraDistritos: Array.isArray(resumoDiv?.distritos)
          ? resumoDiv.distritos.slice(0, 25).map((x) => x.nome)
          : undefined,
        comparativoCadRmaIbge: ibge.comparativoCadRmaIbge
          ? {
              cadu: ibge.comparativoCadRmaIbge.cadu,
              bpc: ibge.comparativoCadRmaIbge.bpc,
              rmaCras: ibge.comparativoCadRmaIbge.rmaCras,
              rmaCreas: ibge.comparativoCadRmaIbge.rmaCreas,
              rmaPop: ibge.comparativoCadRmaIbge.rmaPop
            }
          : undefined
      };
      blocos.push(
        `Dados estruturados IBGE + comparativo (complemento):\n${JSON.stringify(extra, null, 2).slice(0, 12000)}`
      );
    } else if (!ibge.textoContextoAssistente) {
      blocos.push(
        `Dados de referencia IBGE (cache legado):\n${JSON.stringify(ibge, null, 2).slice(0, 4000)}`
      );
    }
  }

  if (perfil.textoMunicipio?.trim()) {
    blocos.push(
      `Sintese territorial e institucional (cadastro local — priorize junto com o IBGE):\n${perfil.textoMunicipio.trim().slice(0, 8000)}`
    );
  }

  const dadosUteis = { ...d };
  delete dadosUteis._raw;
  if (Object.keys(dadosUteis).length > 0) {
    blocos.push(
      `Dados cadastrados (estruturados):\n${JSON.stringify(dadosUteis, null, 2).slice(0, 12000)}`
    );
  }

  return blocos.join("\n\n").slice(0, 20000);
}
