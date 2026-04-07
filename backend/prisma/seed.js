import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedRmaIndicadores() {
  const raw = readFileSync(join(__dirname, "rma-indicadores.json"), "utf8");
  const indicadores = JSON.parse(raw);
  for (const ind of indicadores) {
    await prisma.rmaIndicadorDef.upsert({
      where: { codigo: ind.codigo },
      update: {
        rotulo: ind.rotulo,
        grupo: ind.grupo,
        ordem: ind.ordem
      },
      create: {
        codigo: ind.codigo,
        rotulo: ind.rotulo,
        grupo: ind.grupo,
        ordem: ind.ordem
      }
    });
  }
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@vigilancia.local";
  const adminSenha = process.env.ADMIN_PASSWORD || "admin123";
  const senhaHash = await bcrypt.hash(adminSenha, 12);

  await prisma.usuario.upsert({
    where: { email: adminEmail },
    update: {
      senhaHash,
      role: "MASTER",
      ativo: true
    },
    create: {
      nome: "Master",
      email: adminEmail,
      senhaHash,
      role: "MASTER",
      ativo: true
    }
  });

  await seedRmaIndicadores();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
