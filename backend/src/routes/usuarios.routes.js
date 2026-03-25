import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
const senhaForteRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const createSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().regex(senhaForteRegex, "Senha fraca"),
  role: z.enum(["ADMIN", "HABITACAO"]).default("HABITACAO"),
  ativo: z.boolean().optional()
});

const updateSchema = z.object({
  nome: z.string().min(2).optional(),
  email: z.string().email().optional(),
  senha: z.string().regex(senhaForteRegex, "Senha fraca").optional(),
  role: z.enum(["ADMIN", "HABITACAO"]).optional(),
  ativo: z.boolean().optional()
});

router.use(requireAuth, requireRole("MASTER", "ADMIN"));

router.get("/", async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    where: { role: { in: ["ADMIN", "HABITACAO"] } },
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      ativo: true,
      criadoEm: true,
      atualizadoEm: true
    },
    orderBy: { criadoEm: "desc" }
  });
  return res.json(usuarios);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido",
      code: "USUARIO_INVALID_PAYLOAD"
    });
  }

  const { senha, ...dados } = parsed.data;
  const senhaHash = await bcrypt.hash(senha, 12);

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: {
        ...dados,
        senhaHash,
        ativo: dados.ativo ?? true
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        criadoEm: true
      }
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({
        error: true,
        message: "Email ja cadastrado",
        code: "USUARIO_EMAIL_DUPLICADO"
      });
    }
    throw error;
  }

  return res.status(201).json(usuario);
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido",
      code: "USUARIO_INVALID_PAYLOAD"
    });
  }

  const usuarioAlvo = await prisma.usuario.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true }
  });
  if (!usuarioAlvo || usuarioAlvo.role === "MASTER") {
    return res.status(404).json({
      error: true,
      message: "Usuario nao encontrado",
      code: "USUARIO_NOT_FOUND"
    });
  }

  const data = { ...parsed.data };
  if (parsed.data.senha) {
    data.senhaHash = await bcrypt.hash(parsed.data.senha, 12);
    delete data.senha;
  }

  let usuario;
  try {
    usuario = await prisma.usuario.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        atualizadoEm: true
      }
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({
        error: true,
        message: "Email ja cadastrado",
        code: "USUARIO_EMAIL_DUPLICADO"
      });
    }
    throw error;
  }

  return res.json(usuario);
});

router.delete("/:id", async (req, res) => {
  const usuarioAlvo = await prisma.usuario.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true }
  });
  if (!usuarioAlvo || usuarioAlvo.role === "MASTER") {
    return res.status(404).json({
      error: true,
      message: "Usuario nao encontrado",
      code: "USUARIO_NOT_FOUND"
    });
  }

  await prisma.usuario.update({
    where: { id: req.params.id },
    data: { ativo: false }
  });
  return res.status(204).send();
});

export default router;
