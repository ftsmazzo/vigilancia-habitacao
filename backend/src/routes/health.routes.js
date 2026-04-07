import { Router } from "express";
import { prisma } from "../utils/prisma.js";

const router = Router();

router.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  return res.json({
    ok: true,
    service: "vigilancia-socioassistencial-api",
    timestamp: new Date().toISOString()
  });
});

export default router;
