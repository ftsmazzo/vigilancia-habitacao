import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

function scopeWhereByUser(user) {
  if (user.role === "HABITACAO") {
    return { criadoPorUsuarioId: user.sub };
  }
  return {};
}

router.get("/overview", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
  const whereEmp = scopeWhereByUser(req.user);
  const empreendimentos = await prisma.empreendimento.findMany({
    where: whereEmp,
    select: {
      id: true,
      nome: true,
      municipio: true,
      status: true,
      criadoEm: true
    },
    orderBy: { criadoEm: "desc" }
  });

  const empreendimentoIds = empreendimentos.map((e) => e.id);
  const preSelecionadosWhere =
    empreendimentoIds.length > 0 ? { empreendimentoId: { in: empreendimentoIds } } : { empreendimentoId: "___none___" };

  const [totalListas, totalPessoasCadu, totalFamiliasCadu, totalBpc, totalBpcIdoso, totalBpcDeficiente, groupedStatus, groupedTotal] = await Promise.all([
    prisma.preSelecionado.count({ where: preSelecionadosWhere }),
    prisma.caduPessoa.count(),
    prisma.caduFamilia.count(),
    prisma.bpcBeneficio.count(),
    prisma.bpcBeneficio.count({ where: { tipo: "IDOSO" } }),
    prisma.bpcBeneficio.count({ where: { tipo: "DEFICIENTE" } }),
    prisma.preSelecionado.groupBy({
      by: ["empreendimentoId", "statusVigilancia"],
      where: preSelecionadosWhere,
      _count: { _all: true }
    }),
    prisma.preSelecionado.groupBy({
      by: ["empreendimentoId"],
      where: preSelecionadosWhere,
      _count: { _all: true }
    })
  ]);

  const totalsByEmp = new Map(groupedTotal.map((item) => [item.empreendimentoId, item._count._all]));
  const statusByEmp = new Map();
  for (const item of groupedStatus) {
    if (!statusByEmp.has(item.empreendimentoId)) {
      statusByEmp.set(item.empreendimentoId, {
        NAO_ENCONTRADO: 0,
        DESATUALIZADO: 0,
        ATUALIZADO: 0,
        PENDENTE_ANALISE: 0
      });
    }
    statusByEmp.get(item.empreendimentoId)[item.statusVigilancia] = item._count._all;
  }

  const empreendimentosResumo = empreendimentos.map((emp) => {
    const status = statusByEmp.get(emp.id) || {
      NAO_ENCONTRADO: 0,
      DESATUALIZADO: 0,
      ATUALIZADO: 0,
      PENDENTE_ANALISE: 0
    };
    const totalListados = totalsByEmp.get(emp.id) || 0;
    const encontrados = status.ATUALIZADO + status.DESATUALIZADO;
    return {
      ...emp,
      totalListados,
      encontrados,
      naoEncontrados: status.NAO_ENCONTRADO,
      atualizados: status.ATUALIZADO,
      desatualizados: status.DESATUALIZADO,
      pendentes: status.PENDENTE_ANALISE
    };
  });

  return res.json({
    cards: {
      totalEmpreendimentos: empreendimentos.length,
      totalListas,
      totalFamiliasCadu,
      totalPessoasCadu,
      totalBpc,
      totalBpcIdoso,
      totalBpcDeficiente
    },
    empreendimentos: empreendimentosResumo
  });
});

export default router;
