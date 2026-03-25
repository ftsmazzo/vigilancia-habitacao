import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
const senhaForteRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(6)
});
const updateMeSchema = z.object({
  nome: z.string().min(2).optional(),
  email: z.string().email().optional()
});
const changePasswordSchema = z.object({
  senhaAtual: z.string().min(6),
  novaSenha: z.string().regex(senhaForteRegex, "Senha fraca")
});

router.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido",
      code: "AUTH_LOGIN_INVALID_PAYLOAD"
    });
  }

  const { email, senha } = parsed.data;
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario || !usuario.ativo) {
    return res.status(401).json({
      error: true,
      message: "Credenciais invalidas",
      code: "AUTH_INVALID_CREDENTIALS"
    });
  }

  const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaOk) {
    return res.status(401).json({
      error: true,
      message: "Credenciais invalidas",
      code: "AUTH_INVALID_CREDENTIALS"
    });
  }

  const payload = { sub: usuario.id, role: usuario.role, email: usuario.email };
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: accessExpiresIn });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: refreshExpiresIn });

  return res.json({ accessToken, refreshToken });
});

router.post("/refresh", (req, res) => {
  const token = req.body?.refreshToken;
  if (!token) {
    return res.status(400).json({
      error: true,
      message: "Refresh token ausente",
      code: "AUTH_REFRESH_MISSING"
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const payload = { sub: decoded.sub, role: decoded.role, email: decoded.email };
    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: accessExpiresIn });
    return res.json({ accessToken });
  } catch (_error) {
    return res.status(401).json({
      error: true,
      message: "Refresh token invalido",
      code: "AUTH_REFRESH_INVALID"
    });
  }
});

router.post("/logout", (_req, res) => {
  return res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.user.sub },
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      ativo: true,
      criadoEm: true
    }
  });

  if (!usuario || !usuario.ativo) {
    return res.status(401).json({
      error: true,
      message: "Usuario invalido",
      code: "AUTH_USER_INVALID"
    });
  }

  return res.json(usuario);
});

router.put("/me", requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido",
      code: "AUTH_ME_INVALID_PAYLOAD"
    });
  }

  try {
    const usuario = await prisma.usuario.update({
      where: { id: req.user.sub },
      data: parsed.data,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        atualizadoEm: true
      }
    });
    return res.json(usuario);
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({
        error: true,
        message: "Email ja cadastrado",
        code: "AUTH_ME_EMAIL_DUPLICADO"
      });
    }
    throw error;
  }
});

router.put("/me/senha", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message:
        "Senha invalida. Use no minimo 8 caracteres com letra maiuscula, minuscula, numero e simbolo.",
      code: "AUTH_PASSWORD_INVALID"
    });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: req.user.sub },
    select: { id: true, senhaHash: true, ativo: true }
  });
  if (!usuario || !usuario.ativo) {
    return res.status(401).json({
      error: true,
      message: "Usuario invalido",
      code: "AUTH_USER_INVALID"
    });
  }

  const senhaAtualOk = await bcrypt.compare(parsed.data.senhaAtual, usuario.senhaHash);
  if (!senhaAtualOk) {
    return res.status(400).json({
      error: true,
      message: "Senha atual incorreta",
      code: "AUTH_PASSWORD_CURRENT_INVALID"
    });
  }

  const senhaHash = await bcrypt.hash(parsed.data.novaSenha, 12);
  await prisma.usuario.update({
    where: { id: req.user.sub },
    data: { senhaHash }
  });

  return res.status(204).send();
});

export default router;
