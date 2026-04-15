import { prisma } from "../utils/prisma.js";
import {
  obterPainelCadVigilanciaCompleto,
  resumoRmaCrasPorIbge,
  resumoRmaCreasPorIbge,
  resumoRmaPopPorIbge
} from "./comparativoMunicipio.service.js";

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

/**
 * @param {object|null} perfil
 * @param {{
 *   municipalCardsFromPainel?: object|null,
 *   rmaCrasTotais?: object|null
 * }} [opts] — municipalCards: vw_vig ao vivo; rmaCrasTotais: ultimo mes no banco (alinha ao agente)
 */
export function resumoMunicipioParaRag(perfil, opts = {}) {
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
  const liveCards = opts.municipalCardsFromPainel;
  let linhaPainelMunicipalIncluida = false;

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
    if (ibge.indicadoresCidades?.pibPerCapitaReaisCalculado?.valor != null) {
      partes.push(
        `PIB per capita (IBGE, calculado): R$ ${Number(ibge.indicadoresCidades.pibPerCapitaReaisCalculado.valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}.`
      );
    }
    const comp = ibge.comparativoCadRmaIbge;
    const painel = comp?.painelCadVigilancia;
    if (painel?.caduImport?.totalFamilias != null) {
      partes.push(
        `CadUnico (import): ${painel.caduImport.totalFamilias} familias.`
      );
    }
    if (liveCards && typeof liveCards === "object" && liveCards.totalPessoas != null) {
      partes.push(
        `Painel vigilancia municipal (vw_vig_* — nesta requisicao, mesmo criterio do dashboard): ${liveCards.totalPessoas} pessoas, ${liveCards.totalFamilias ?? "—"} familias.`
      );
      linhaPainelMunicipalIncluida = true;
    } else if (painel?.municipal?.cards?.totalPessoas != null) {
      partes.push(
        `Painel vigilancia municipal (cache ultima sync IBGE — pode divergir do dashboard): ${painel.municipal.cards.totalPessoas} pessoas.`
      );
      linhaPainelMunicipalIncluida = true;
    }
    const rmaC1AoVivo = opts.rmaCrasTotais?.c1;
    if (rmaC1AoVivo != null) {
      partes.push(`RMA CRAS C.1 (ultimo mes no banco, nesta requisicao): ${rmaC1AoVivo}.`);
    } else if (comp?.rmaCras?.totaisMunicipio?.c1 != null) {
      partes.push(`RMA CRAS C.1 (cache IBGE): ${comp.rmaCras.totaisMunicipio.c1}.`);
    }
  }

  if (
    !linhaPainelMunicipalIncluida &&
    liveCards &&
    typeof liveCards === "object" &&
    liveCards.totalPessoas != null
  ) {
    partes.push(
      `Painel vigilancia municipal (vw_vig_* — nesta requisicao, mesmo criterio do dashboard): ${liveCards.totalPessoas} pessoas, ${liveCards.totalFamilias ?? "—"} familias.`
    );
  }

  if (
    (!ibge || typeof ibge !== "object") &&
    opts.rmaCrasTotais?.c1 != null
  ) {
    partes.push(
      `RMA CRAS C.1 (ultimo mes no banco, nesta requisicao): ${opts.rmaCrasTotais.c1}.`
    );
  }

  return partes.join(" ");
}

/** Reduz painel completo (obterPainelCadVigilanciaCompleto) ao formato enviado ao modelo. */
function painelCadVigilanciaResumoParaPrompt(painel) {
  if (!painel || typeof painel !== "object") return undefined;
  return {
    caduImport: painel.caduImport ?? null,
    bpcImport: painel.bpcImport ?? null,
    aviso: painel.aviso ?? null,
    municipalCards: painel.municipal?.cards ?? painel.municipalCards ?? null,
    porCrasResumo: Array.isArray(painel.porCras)
      ? painel.porCras.map((x) => ({
          codigo: x.codigo,
          nome: x.nome,
          totalPessoas: x.cards?.totalPessoas,
          totalFamilias: x.cards?.totalFamilias
        }))
      : painel.porCrasResumo
  };
}

function mergeComparativoIbge(ibgeComparativo, options) {
  const base =
    ibgeComparativo && typeof ibgeComparativo === "object"
      ? { ...ibgeComparativo }
      : {};
  if (options.painelCadVigilancia != null) {
    base.painelCadVigilancia = options.painelCadVigilancia;
  }
  if (options.rmaComparativo && typeof options.rmaComparativo === "object") {
    const rc = options.rmaComparativo;
    if (Object.prototype.hasOwnProperty.call(rc, "rmaCras")) base.rmaCras = rc.rmaCras;
    if (Object.prototype.hasOwnProperty.call(rc, "rmaCreas")) base.rmaCreas = rc.rmaCreas;
    if (Object.prototype.hasOwnProperty.call(rc, "rmaPop")) base.rmaPop = rc.rmaPop;
  }
  return base;
}

/**
 * Texto para o prompt principal do assistente (sem truncar demais o texto livre).
 * @param {object|null} perfil
 * @param {{ painelCadVigilancia?: object, rmaComparativo?: { rmaCras?: any, rmaCreas?: any, rmaPop?: any } }} [options]
 *        Quando informado, substitui snapshot do ibgeCacheJson (alinha ao painel Vigilancia / RMA atual).
 */
export function formatMunicipioPerfilForPrompt(perfil, options = {}) {
  if (!perfil) {
    return "(Nenhum perfil municipal configurado no sistema. Evite supor dados locais especificos; use apenas o que vier no pedido, no RMA e na base normativa.)";
  }
  const injectPainel = options.painelCadVigilancia != null;
  const injectRma = options.rmaComparativo != null;
  const d =
    perfil.dadosJson && typeof perfil.dadosJson === "object"
      ? perfil.dadosJson
      : {};
  const blocos = [];

  blocos.push(
    `Identificacao: ${perfil.nome} / ${perfil.uf} — IBGE ${perfil.codigoIbge}.`
  );

  const ibge =
    perfil.ibgeCacheJson && typeof perfil.ibgeCacheJson === "object"
      ? perfil.ibgeCacheJson
      : null;

  if (ibge) {
    if (ibge.textoContextoAssistente && String(ibge.textoContextoAssistente).trim()) {
      blocos.push(
        `### Contexto territorial (IBGE + dados locais — obtido pela sincronizacao)\n${String(ibge.textoContextoAssistente).trim().slice(0, 24000)}`
      );
    }

    const temIbgeEstruturado =
      (ibge.versao === 2 || ibge.versao === 3 || ibge.versao === 4) &&
      ibge.localidade;
    const deveIncluirComparativo =
      temIbgeEstruturado || injectPainel || injectRma;

    if (deveIncluirComparativo) {
      const resumoDiv = ibge.divisoesTerritoriais;
      const compMerged = mergeComparativoIbge(ibge.comparativoCadRmaIbge, options);
      const extra = {
        ...(temIbgeEstruturado
          ? {
              localidade: ibge.localidade,
              populacaoCenso2022: ibge.populacaoCenso2022,
              indicadoresCidades: ibge.indicadoresCidades,
              quantidadeDistritos: resumoDiv?.quantidadeDistritos,
              quantidadeSubdistritos: resumoDiv?.quantidadeSubdistritos,
              amostraDistritos: Array.isArray(resumoDiv?.distritos)
                ? resumoDiv.distritos.slice(0, 25).map((x) => x.nome)
                : undefined
            }
          : {
              notaEstruturado:
                "Bloco IBGE estruturado (versao/localidade) incompleto; comparativo CADU/RMA abaixo reflete a requisicao atual quando indicado em _fontePainelRma."
            }),
        comparativoCadRmaIbge: {
          painelCadVigilancia: painelCadVigilanciaResumoParaPrompt(
            compMerged.painelCadVigilancia
          ),
          rmaCras: compMerged.rmaCras,
          rmaCreas: compMerged.rmaCreas,
          rmaPop: compMerged.rmaPop,
          _escopoPainelCadu:
            "municipio inteiro (unidadeTerritorial=TODOS, sem filtro de bairros) — igual ao carregamento inicial do painel Vigilancia; se o usuario filtrar CRAS ou bairro no dashboard, os numeros la podem diferir.",
          _fontePainelRma:
            injectPainel || injectRma
              ? "ao_vivo_mesma_api_do_dashboard_vw_vig"
              : "snapshot_ibge_cache_pode_divergir"
        }
      };
      blocos.push(
        `Dados estruturados IBGE + comparativo (complemento):\n${JSON.stringify(extra, null, 2).slice(0, 14000)}`
      );
    } else if (!ibge.textoContextoAssistente) {
      blocos.push(
        `Dados de referencia IBGE (cache legado):\n${JSON.stringify(ibge, null, 2).slice(0, 4000)}`
      );
    }
  } else if (injectPainel || injectRma) {
    const compMerged = mergeComparativoIbge(null, options);
    const extra = {
      nota: "Perfil sem ibgeCacheJson; apenas painel CADU e RMA nesta resposta.",
      comparativoCadRmaIbge: {
        painelCadVigilancia: painelCadVigilanciaResumoParaPrompt(
          compMerged.painelCadVigilancia
        ),
        rmaCras: compMerged.rmaCras,
        rmaCreas: compMerged.rmaCreas,
        rmaPop: compMerged.rmaPop,
        _escopoPainelCadu:
          "municipio inteiro (unidadeTerritorial=TODOS, sem filtro de bairros) — igual ao carregamento inicial do painel Vigilancia.",
        _fontePainelRma: "ao_vivo_mesma_api_do_dashboard_vw_vig"
      }
    };
    blocos.push(
      `Comparativo CADU / RMA (ao vivo):\n${JSON.stringify(extra, null, 2).slice(0, 14000)}`
    );
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

  return blocos.join("\n\n").slice(0, 36000);
}

/**
 * Carrega painel Vigilancia (vw_vig_*) e ultimo mes RMA no banco — mesma base numerica do dashboard.
 */
export async function formatMunicipioPerfilParaAgente(perfil) {
  if (!perfil) {
    return {
      perfilMunicipioContexto: formatMunicipioPerfilForPrompt(null),
      perfilMunicipioResumo: resumoMunicipioParaRag(null)
    };
  }
  const codigoIbge = perfil.codigoIbge;
  const [painelCadVigilancia, rmaCras, rmaCreas, rmaPop] = await Promise.all([
    obterPainelCadVigilanciaCompleto(),
    resumoRmaCrasPorIbge(codigoIbge),
    resumoRmaCreasPorIbge(codigoIbge),
    resumoRmaPopPorIbge(codigoIbge)
  ]);
  const opts = {
    painelCadVigilancia,
    rmaComparativo: { rmaCras, rmaCreas, rmaPop }
  };
  return {
    perfilMunicipioContexto: formatMunicipioPerfilForPrompt(perfil, opts),
    perfilMunicipioResumo: resumoMunicipioParaRag(perfil, {
      municipalCardsFromPainel: painelCadVigilancia?.municipal?.cards,
      rmaCrasTotais: rmaCras?.totaisMunicipio ?? null
    })
  };
}
