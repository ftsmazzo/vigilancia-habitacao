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
  numUnidades: z.number().int().positive().optional()
});

const updateSchema = createSchema.partial();

function empreendimentoScopeFilter(req) {
  if (req.user.role === "HABITACAO") {
    return { criadoPorUsuarioId: req.user.sub };
  }
  return {};
}

async function getEmpreendimentoByScope(req, id) {
  const where = { id, ...empreendimentoScopeFilter(req) };
  return prisma.empreendimento.findFirst({ where });
}

router.get("/", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
  const where =
    req.user.role === "HABITACAO"
      ? {
          criadoPorUsuarioId: req.user.sub
        }
      : undefined;

  const itens = await prisma.empreendimento.findMany({
    where,
    orderBy: { criadoEm: "desc" }
  });
  return res.json(itens);
});

router.post("/", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
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

router.put("/:id", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
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

router.delete("/:id", requireAuth, requireRole("MASTER", "ADMIN", "HABITACAO"), async (req, res) => {
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
  requireRole("MASTER", "ADMIN", "HABITACAO"),
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

export default router;
