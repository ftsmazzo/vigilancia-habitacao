import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

const createSchema = z.object({
  nome: z.string().min(3),
  endereco: z.string().optional(),
  municipio: z.string().optional(),
  numUnidades: z.number().int().positive().optional()
});

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

export default router;
