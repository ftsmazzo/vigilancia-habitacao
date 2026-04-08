import { prisma } from "../utils/prisma.js";

const mesesAtualizacao = Math.max(1, Number(process.env.CADU_ATUALIZACAO_MESES || 24));

/** Mesmo payload do GET /cadu/status (para contexto do assistente sem HTTP). */
export async function getCaduImportStatusSnapshot() {
  const limiteAtualizacao = new Date();
  limiteAtualizacao.setMonth(limiteAtualizacao.getMonth() - mesesAtualizacao);

  const [
    totalPessoas,
    totalFamilias,
    ultimoImport,
    dataBaseMax,
    familiasComBolsa,
    familiasAtualizadas,
    familiasDesatualizadas
  ] = await Promise.all([
    prisma.caduRawLinha.count(),
    prisma.caduFamilia.count(),
    prisma.caduRawImport.findFirst({
      orderBy: { criadoEm: "desc" },
      select: {
        criadoEm: true,
        finalizadoEm: true,
        totalLinhas: true,
        status: true,
        id: true,
        nomeArquivo: true
      }
    }),
    prisma.caduFamilia.aggregate({
      _max: { dataAtualFam: true }
    }),
    prisma.caduFamilia.count({ where: { recebePbfFam: true } }),
    prisma.caduFamilia.count({
      where: {
        dataAtualFam: { gte: limiteAtualizacao }
      }
    }),
    prisma.caduFamilia.count({
      where: {
        OR: [{ dataAtualFam: { lt: limiteAtualizacao } }, { dataAtualFam: null }]
      }
    })
  ]);

  return {
    totalPessoas,
    totalFamilias,
    familiasComBolsa,
    familiasAtualizadas,
    familiasDesatualizadas,
    percentualAtualizacaoCadastral:
      totalFamilias > 0 ? `${Math.round((familiasAtualizadas * 100) / totalFamilias)}%` : "0%",
    dataBaseReferencia: dataBaseMax._max.dataAtualFam || null,
    ultimoUpload: ultimoImport || null
  };
}

/** Mesmo payload do GET /bpc/status. */
export async function getBpcImportStatusSnapshot() {
  const [total, idosos, deficientes, ultimo] = await Promise.all([
    prisma.bpcBeneficio.count(),
    prisma.bpcBeneficio.count({ where: { tipo: "IDOSO" } }),
    prisma.bpcBeneficio.count({ where: { tipo: "DEFICIENTE" } }),
    prisma.bpcBeneficio.findFirst({
      orderBy: { importadoEm: "desc" },
      select: { importadoEm: true, competenciaPeriodo: true }
    })
  ]);

  return {
    total,
    idosos,
    deficientes,
    ultimoUploadEm: ultimo?.importadoEm || null,
    competenciaReferencia: ultimo?.competenciaPeriodo || null
  };
}
