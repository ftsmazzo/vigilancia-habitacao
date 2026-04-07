import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { decodeCsvBuffer } from "../src/utils/rmaCsv.js";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

const META_CREAS = new Set([
  "mes_referencia",
  "nome_unidade",
  "id_creas",
  "endereco",
  "municipio",
  "uf",
  "coordenador_creas",
  "cpf",
  "codigoibge"
]);

const META_POP = new Set([
  "mes_ano",
  "mes_referencia",
  "nome_unidade",
  "id_unidade",
  "endereco",
  "municipio",
  "uf",
  "coordenador",
  "cpf",
  "ibge"
]);

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

async function seedRmaCreasIndicadores() {
  const buf = readFileSync(join(__dirname, "rma-creas-dicionario.csv"));
  const text = decodeCsvBuffer(buf);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let ordem = 0;
  for (const line of lines) {
    const idx = line.indexOf(";");
    if (idx <= 0) continue;
    const codigo = line
      .slice(0, idx)
      .trim()
      .replace(/^\ufeff/, "")
      .toLowerCase();
    if (!codigo || META_CREAS.has(codigo)) continue;
    let rotulo = line.slice(idx + 1).trim();
    if (
      (rotulo.startsWith("'") && rotulo.endsWith("'")) ||
      (rotulo.startsWith('"') && rotulo.endsWith('"'))
    ) {
      rotulo = rotulo.slice(1, -1);
    }
    const grupo = codigo[0] ? codigo[0].toUpperCase() : null;
    ordem += 1;
    await prisma.rmaCreasIndicadorDef.upsert({
      where: { codigo },
      update: { rotulo, grupo, ordem },
      create: { codigo, rotulo, grupo, ordem }
    });
  }
}

async function seedRmaPopIndicadores() {
  const buf = readFileSync(join(__dirname, "rma-pop-dicionario.csv"));
  const text = decodeCsvBuffer(buf);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let ordem = 0;
  for (const line of lines) {
    const idx = line.indexOf(";");
    if (idx <= 0) continue;
    const codigo = line
      .slice(0, idx)
      .trim()
      .replace(/^\ufeff/, "")
      .toLowerCase();
    if (!codigo || META_POP.has(codigo)) continue;
    let rotulo = line.slice(idx + 1).trim();
    if (
      (rotulo.startsWith("'") && rotulo.endsWith("'")) ||
      (rotulo.startsWith('"') && rotulo.endsWith('"'))
    ) {
      rotulo = rotulo.slice(1, -1);
    }
    const grupo = codigo[0] ? codigo[0].toUpperCase() : null;
    ordem += 1;
    await prisma.rmaPopIndicadorDef.upsert({
      where: { codigo },
      update: { rotulo, grupo, ordem },
      create: { codigo, rotulo, grupo, ordem }
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
  await seedRmaCreasIndicadores();
  await seedRmaPopIndicadores();
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
