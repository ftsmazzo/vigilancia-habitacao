import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
