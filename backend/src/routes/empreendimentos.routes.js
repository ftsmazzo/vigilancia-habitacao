import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { parseHabitacaoWorkbook } from "../utils/habitacaoSheet.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const createSchema = z.object({
  nome: z.string().min(3),
  endereco: z.string().optional(),
  municipio: z.string().optional(),
  numUnidades: z.number().int().positive().optional(),
  status: z.enum(["EM_CAPTACAO", "EM_ANALISE", "CONCLUIDO"]).optional()
});

const updateSchema = createSchema.partial();
const mesesAtualizacao = Math.max(1, Number(process.env.CADU_ATUALIZACAO_MESES || 24));

async function getEmpreendimentoByScope(req, id) {
  return prisma.empreendimento.findUnique({ where: { id } });
}

function isCadastroDesatualizado(dataAtualFam) {
  if (!dataAtualFam) return true;
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setMonth(limite.getMonth() - mesesAtualizacao);
  return dataAtualFam < limite;
}

router.get("/", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
  const itens = await prisma.empreendimento.findMany({
    orderBy: { criadoEm: "desc" }
  });
  return res.json(itens);
});

router.post("/", requireAuth, requireRole("MASTER", "ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido",
      code: "EMPREENDIMENTO_INVALID_PAYLOAD"
    });
  }

  const empreendimento = await prisma.empreendimento.create({
    data: {
      ...parsed.data,
      criadoPorUsuarioId: req.user?.sub || null
    }
  });

  return res.status(201).json(empreendimento);
});

router.get("/:id", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
  const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
  if (!empreendimento) {
    return res.status(404).json({
      error: true,
      message: "Empreendimento nao encontrado",
      code: "EMPREENDIMENTO_NOT_FOUND"
    });
  }
  return res.json(empreendimento);
});

router.put("/:id", requireAuth, requireRole("MASTER", "ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido",
      code: "EMPREENDIMENTO_INVALID_PAYLOAD"
    });
  }

  const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
  if (!empreendimento) {
    return res.status(404).json({
      error: true,
      message: "Empreendimento nao encontrado",
      code: "EMPREENDIMENTO_NOT_FOUND"
    });
  }

  const updated = await prisma.empreendimento.update({
    where: { id: empreendimento.id },
    data: parsed.data
  });

  return res.json(updated);
});

router.delete("/:id", requireAuth, requireRole("MASTER", "ADMIN"), async (req, res) => {
  const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
  if (!empreendimento) {
    return res.status(404).json({
      error: true,
      message: "Empreendimento nao encontrado",
      code: "EMPREENDIMENTO_NOT_FOUND"
    });
  }

  await prisma.empreendimento.delete({ where: { id: empreendimento.id } });
  return res.status(204).send();
});

router.post(
  "/:id/pre-selecionados/upload",
  requireAuth,
  requireRole("MASTER", "ADMIN"),
  upload.single("arquivo"),
  async (req, res) => {
    const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
    if (!empreendimento) {
      return res.status(404).json({
        error: true,
        message: "Empreendimento nao encontrado",
        code: "EMPREENDIMENTO_NOT_FOUND"
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        error: true,
        message: "Arquivo obrigatorio",
        code: "UPLOAD_FILE_REQUIRED"
      });
    }

    let parsed;
    try {
      parsed = parseHabitacaoWorkbook(req.file.buffer);
    } catch (error) {
      return res.status(400).json({
        error: true,
        message: error.message || "Falha ao ler planilha",
        code: "UPLOAD_PARSE_ERROR"
      });
    }

    const seen = new Set();
    let importados = 0;
    let ignorados = 0;
    const erros = [...parsed.errors];

    for (const row of parsed.rows) {
      const uniqueKey = `${empreendimento.id}:${row.cpf}`;
      if (seen.has(uniqueKey)) {
        ignorados += 1;
        continue;
      }
      seen.add(uniqueKey);

      const existe = await prisma.preSelecionado.findUnique({
        where: {
          empreendimentoId_cpf: {
            empreendimentoId: empreendimento.id,
            cpf: row.cpf
          }
        }
      });

      if (existe) {
        ignorados += 1;
        continue;
      }

      await prisma.preSelecionado.create({
        data: {
          empreendimentoId: empreendimento.id,
          cpf: row.cpf,
          nomeInformado: row.nomeInformado,
          nisInformado: row.nisInformado,
          dataAtualizacaoInscricao: row.dataAtualizacaoInscricao ? new Date(row.dataAtualizacaoInscricao) : null,
          contato: row.contato,
          camposOriginaisPlanilha: row.camposOriginaisPlanilha
        }
      });

      importados += 1;
    }

    return res.json({
      importados,
      ignorados,
      erros,
      totalLinhasLidas: parsed.rows.length
    });
  }
);

router.get("/:id/pre-selecionados", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
  const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
  if (!empreendimento) {
    return res.status(404).json({
      error: true,
      message: "Empreendimento nao encontrado",
      code: "EMPREENDIMENTO_NOT_FOUND"
    });
  }

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const skip = (page - 1) * limit;

  const [total, itens] = await Promise.all([
    prisma.preSelecionado.count({ where: { empreendimentoId: empreendimento.id } }),
    prisma.preSelecionado.findMany({
      where: { empreendimentoId: empreendimento.id },
      orderBy: { criadoEm: "desc" },
      skip,
      take: limit
    })
  ]);

  return res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    itens
  });
});

router.post("/:id/cruzamento", requireAuth, requireRole("MASTER", "ADMIN"), async (req, res) => {
  const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
  if (!empreendimento) {
    return res.status(404).json({
      error: true,
      message: "Empreendimento nao encontrado",
      code: "EMPREENDIMENTO_NOT_FOUND"
    });
  }

  const pendentes = await prisma.preSelecionado.findMany({
    where: { empreendimentoId: empreendimento.id },
    orderBy: { criadoEm: "asc" }
  });

  let encontrados = 0;
  let naoEncontrados = 0;
  let atualizados = 0;
  let desatualizados = 0;
  let beneficiariosPbf = 0;
  let beneficiariosBpc = 0;

  for (const ps of pendentes) {
    const pessoa = await prisma.caduPessoa.findUnique({ where: { cpf: ps.cpf } });

    if (!pessoa) {
      await prisma.preSelecionado.update({
        where: { id: ps.id },
        data: {
          statusCruzamento: "NAO_ENCONTRADO",
          statusVigilancia: "NAO_ENCONTRADO",
          motivoStatus: "CPF nao encontrado na base CADU",
          recebePbf: false,
          cruzadoEm: new Date()
        }
      });
      await prisma.dadosCruzados.deleteMany({ where: { preSelecionadoId: ps.id } });
      naoEncontrados += 1;
      continue;
    }

    const familia = pessoa.codFamiliarFam
      ? await prisma.caduFamilia.findUnique({ where: { codFamiliarFam: pessoa.codFamiliarFam } })
      : null;
    const bpc = await prisma.bpcBeneficio.findUnique({ where: { cpf: ps.cpf } });

    const desatualizado = isCadastroDesatualizado(pessoa.dataAtualFam);
    const recebePbf = Boolean(pessoa.recebePbfFam || pessoa.recebePbfPessoa);
    const statusVigilancia = desatualizado ? "DESATUALIZADO" : "ATUALIZADO";
    const motivoStatus = desatualizado
      ? `Cadastro com mais de ${mesesAtualizacao} meses`
      : "Cadastro atualizado";

    await prisma.preSelecionado.update({
      where: { id: ps.id },
      data: {
        statusCruzamento: "ENCONTRADO",
        statusVigilancia,
        motivoStatus,
        recebePbf: recebePbf,
        observacoes: bpc ? `BPC ${bpc.tipo}` : ps.observacoes,
        cruzadoEm: new Date()
      }
    });

    await prisma.dadosCruzados.upsert({
      where: { preSelecionadoId: ps.id },
      update: {
        camposCADU: {
          pessoa: {
            cpf: pessoa.cpf,
            nomePessoa: pessoa.nomePessoa,
            nisPessoa: pessoa.nisPessoa,
            dataAtualFam: pessoa.dataAtualFam,
            recebePbfFam: pessoa.recebePbfFam,
            recebePbfPessoa: pessoa.recebePbfPessoa,
            rendaPerCapitaFam: pessoa.rendaPerCapitaFam,
            composicaoFamiliar: pessoa.composicaoFamiliar,
            codFamiliarFam: pessoa.codFamiliarFam
          },
          bpc: bpc
            ? {
                tipo: bpc.tipo,
                especieBeneficio: bpc.especieBeneficio,
                situacao: bpc.situacao,
                competenciaPeriodo: bpc.competenciaPeriodo
              }
            : null,
          familia: familia
            ? {
                codFamiliarFam: familia.codFamiliarFam,
                dataAtualFam: familia.dataAtualFam,
                rendaPerCapitaFam: familia.rendaPerCapitaFam,
                composicaoFamiliar: familia.composicaoFamiliar,
                recebePbfFam: familia.recebePbfFam,
                municipio: familia.municipio,
                endereco: familia.endereco
              }
            : null
        }
      },
      create: {
        preSelecionadoId: ps.id,
        camposCADU: {
          pessoa: {
            cpf: pessoa.cpf,
            nomePessoa: pessoa.nomePessoa,
            nisPessoa: pessoa.nisPessoa,
            dataAtualFam: pessoa.dataAtualFam,
            recebePbfFam: pessoa.recebePbfFam,
            recebePbfPessoa: pessoa.recebePbfPessoa,
            rendaPerCapitaFam: pessoa.rendaPerCapitaFam,
            composicaoFamiliar: pessoa.composicaoFamiliar,
            codFamiliarFam: pessoa.codFamiliarFam
          },
          bpc: bpc
            ? {
                tipo: bpc.tipo,
                especieBeneficio: bpc.especieBeneficio,
                situacao: bpc.situacao,
                competenciaPeriodo: bpc.competenciaPeriodo
              }
            : null,
          familia: familia
            ? {
                codFamiliarFam: familia.codFamiliarFam,
                dataAtualFam: familia.dataAtualFam,
                rendaPerCapitaFam: familia.rendaPerCapitaFam,
                composicaoFamiliar: familia.composicaoFamiliar,
                recebePbfFam: familia.recebePbfFam,
                municipio: familia.municipio,
                endereco: familia.endereco
              }
            : null
        }
      }
    });

    encontrados += 1;
    if (recebePbf) beneficiariosPbf += 1;
    if (bpc) beneficiariosBpc += 1;
    if (desatualizado) desatualizados += 1;
    else atualizados += 1;
  }

  await prisma.logAuditoria.create({
    data: {
      usuarioId: req.user.sub,
      acao: "CRUZAMENTO_EXECUTADO",
      detalhes: {
        empreendimentoId: empreendimento.id,
        total: pendentes.length,
        encontrados,
        naoEncontrados,
        atualizados,
        desatualizados,
        beneficiariosPbf,
        beneficiariosBpc
      }
    }
  });

  return res.json({
    total: pendentes.length,
    encontrados,
    naoEncontrados,
    atualizados,
    desatualizados,
    beneficiariosPbf,
    beneficiariosBpc
  });
});

router.get(
  "/:id/cruzamento/resultados",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO"),
  async (req, res) => {
    const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
    if (!empreendimento) {
      return res.status(404).json({
        error: true,
        message: "Empreendimento nao encontrado",
        code: "EMPREENDIMENTO_NOT_FOUND"
      });
    }

    const statusVigilancia = req.query.statusVigilancia;
    const pbf = req.query.pbf;
    const bpc = req.query.bpc;
    const bpcTipo = req.query.bpcTipo;
    const q = String(req.query.q || "").trim();

    const where = { empreendimentoId: empreendimento.id };
    if (statusVigilancia && ["NAO_ENCONTRADO", "DESATUALIZADO", "ATUALIZADO", "PENDENTE_ANALISE"].includes(statusVigilancia)) {
      where.statusVigilancia = statusVigilancia;
    }
    if (q) {
      where.OR = [
        { nomeInformado: { contains: q, mode: "insensitive" } },
        { cpf: { contains: q } }
      ];
    }

    if (bpc === "COM_BPC" || bpc === "SEM_BPC" || bpcTipo === "IDOSO" || bpcTipo === "DEFICIENTE") {
      const cpfsBaseRows = await prisma.preSelecionado.findMany({
        where,
        select: { cpf: true }
      });
      const cpfsBase = [...new Set(cpfsBaseRows.map((x) => x.cpf))];
      if (cpfsBase.length === 0) {
        where.cpf = { in: ["__none__"] };
      } else {
        const bpcWhere = {
          cpf: { in: cpfsBase }
        };
        if (bpcTipo === "IDOSO" || bpcTipo === "DEFICIENTE") {
          bpcWhere.tipo = bpcTipo;
        }
        const bpcRows = await prisma.bpcBeneficio.findMany({
          where: bpcWhere,
          select: { cpf: true }
        });
        const cpfsComBpc = [...new Set(bpcRows.map((x) => x.cpf))];
        if (bpc === "SEM_BPC") {
          where.cpf = { notIn: cpfsComBpc.length ? cpfsComBpc : [] };
        } else {
          where.cpf = { in: cpfsComBpc.length ? cpfsComBpc : ["__none__"] };
        }
      }
    }

    if (pbf === "COM_BOLSA" || pbf === "SEM_BOLSA") {
      const cpfsBaseRows = await prisma.preSelecionado.findMany({
        where,
        select: { cpf: true }
      });
      const cpfsBase = [...new Set(cpfsBaseRows.map((x) => x.cpf))];

      if (cpfsBase.length === 0) {
        where.cpf = { in: ["__none__"] };
      } else {
        const cpfsComBolsaRows = await prisma.caduPessoa.findMany({
          where: {
            cpf: { in: cpfsBase },
            OR: [{ recebePbfFam: true }, { recebePbfPessoa: true }]
          },
          select: { cpf: true }
        });
        const cpfsComBolsa = [...new Set(cpfsComBolsaRows.map((x) => x.cpf))];
        if (pbf === "COM_BOLSA") {
          where.cpf = { in: cpfsComBolsa.length ? cpfsComBolsa : ["__none__"] };
        } else {
          where.cpf = { notIn: cpfsComBolsa.length ? cpfsComBolsa : [] };
        }
      }
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const [total, itens] = await Promise.all([
      prisma.preSelecionado.count({ where }),
      prisma.preSelecionado.findMany({
        where,
        orderBy: { cruzadoEm: "desc" },
        skip,
        take: limit,
        include: {
          dadosCruzados: true
        }
      })
    ]);

    const cpfsPagina = [...new Set(itens.map((item) => item.cpf))];
    const [pbfRows, bpcRows] = cpfsPagina.length
      ? await Promise.all([
          prisma.caduPessoa.findMany({
            where: {
              cpf: { in: cpfsPagina },
              OR: [{ recebePbfFam: true }, { recebePbfPessoa: true }]
            },
            select: { cpf: true }
          }),
          prisma.bpcBeneficio.findMany({
            where: { cpf: { in: cpfsPagina } },
            select: { cpf: true, tipo: true }
          })
        ])
      : [[], []];
    const cpfsComBolsaPagina = new Set(pbfRows.map((x) => x.cpf));
    const bpcByCpf = new Map(bpcRows.map((x) => [x.cpf, x.tipo]));

    const itensComPbfCalculado = itens.map((item) => ({
      ...item,
      recebePbfCalculado: cpfsComBolsaPagina.has(item.cpf),
      recebeBpcCalculado: bpcByCpf.has(item.cpf),
      tipoBpcCalculado: bpcByCpf.get(item.cpf) || null
    }));

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      itens: itensComPbfCalculado
    });
  }
);

router.get("/:id/metricas", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
  const empreendimento = await getEmpreendimentoByScope(req, req.params.id);
  if (!empreendimento) {
    return res.status(404).json({
      error: true,
      message: "Empreendimento nao encontrado",
      code: "EMPREENDIMENTO_NOT_FOUND"
    });
  }

  const [totalListados, naoEncontrados, atualizados, desatualizados] = await Promise.all([
    prisma.preSelecionado.count({ where: { empreendimentoId: empreendimento.id } }),
    prisma.preSelecionado.count({
      where: { empreendimentoId: empreendimento.id, statusVigilancia: "NAO_ENCONTRADO" }
    }),
    prisma.preSelecionado.count({
      where: { empreendimentoId: empreendimento.id, statusVigilancia: "ATUALIZADO" }
    }),
    prisma.preSelecionado.count({
      where: { empreendimentoId: empreendimento.id, statusVigilancia: "DESATUALIZADO" }
    })
  ]);

  const encontrados = atualizados + desatualizados;
  const encontradosCpfs = await prisma.preSelecionado.findMany({
    where: { empreendimentoId: empreendimento.id, statusCruzamento: "ENCONTRADO" },
    select: { cpf: true }
  });
  const cpfs = encontradosCpfs.map((x) => x.cpf);
  const beneficiariosPbf =
    cpfs.length > 0
      ? await prisma.caduPessoa.count({
          where: {
            cpf: { in: cpfs },
            OR: [{ recebePbfFam: true }, { recebePbfPessoa: true }]
          }
        })
      : 0;
  const beneficiariosBpc =
    cpfs.length > 0
      ? await prisma.bpcBeneficio.count({
          where: {
            cpf: { in: cpfs }
          }
        })
      : 0;
  const [beneficiariosBpcIdoso, beneficiariosBpcDeficiente] =
    cpfs.length > 0
      ? await Promise.all([
          prisma.bpcBeneficio.count({
            where: {
              cpf: { in: cpfs },
              tipo: "IDOSO"
            }
          }),
          prisma.bpcBeneficio.count({
            where: {
              cpf: { in: cpfs },
              tipo: "DEFICIENTE"
            }
          })
        ])
      : [0, 0];

  const percentualCobertura = totalListados > 0 ? Math.round((encontrados * 100) / totalListados) : 0;
  const percentualDesatualizados = encontrados > 0 ? Math.round((desatualizados * 100) / encontrados) : 0;
  const percentualPbfEncontrados = encontrados > 0 ? Math.round((beneficiariosPbf * 100) / encontrados) : 0;
  const percentualBpcEncontrados = encontrados > 0 ? Math.round((beneficiariosBpc * 100) / encontrados) : 0;

  return res.json({
    totalListados,
    naoEncontrados,
    encontrados,
    atualizados,
    desatualizados,
    beneficiariosPbf,
    beneficiariosBpc,
    beneficiariosBpcIdoso,
    beneficiariosBpcDeficiente,
    percentualCobertura: `${percentualCobertura}%`,
    percentualDesatualizados: `${percentualDesatualizados}%`,
    percentualPbfEncontrados: `${percentualPbfEncontrados}%`,
    percentualBpcEncontrados: `${percentualBpcEncontrados}%`
  });
});

export default router;
