import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

router.get(
  "/overview",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (_req, res) => {
    const [pessoasRow] =
      await prisma.$queryRaw`SELECT
        COUNT(*)::int AS "totalPessoas",
        COUNT(*) FILTER (WHERE (dadosTxt::jsonb ->> 'p.cod_sexo_pessoa') = '1')::int AS "totalHomens",
        COUNT(*) FILTER (WHERE (dadosTxt::jsonb ->> 'p.cod_sexo_pessoa') = '2')::int AS "totalMulheres",
        COUNT(*) FILTER (
          WHERE (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa') IS NOT NULL
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) < 6
        )::int AS "primeiraInfancia",
        COUNT(*) FILTER (
          WHERE (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa') IS NOT NULL
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) >= 6
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) < 15
        )::int AS "criancasAdolescentes",
        COUNT(*) FILTER (
          WHERE (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa') IS NOT NULL
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) >= 15
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) <= 17
        )::int AS "adolescentes",
        COUNT(*) FILTER (
          WHERE (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa') IS NOT NULL
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) >= 18
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) <= 29
        )::int AS "jovens",
        COUNT(*) FILTER (
          WHERE (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa') IS NOT NULL
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) >= 30
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) <= 59
        )::int AS "adultos",
        COUNT(*) FILTER (
          WHERE (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa') IS NOT NULL
            AND date_part('year', age(current_date, (dadosTxt::jsonb ->> 'p.dta_nasc_pessoa')::date)) >= 60
        )::int AS "idosos",
        COUNT(*) FILTER (
          WHERE (dadosTxt::jsonb ->> 'p.cod_deficiencia_memb') = '1'
        )::int AS "pessoasComDeficiencia"
      FROM "CaduRawLinha";`;

    const [familiasRow] =
      await prisma.$queryRaw`SELECT
        COUNT(*) FILTER (
          WHERE "rendaPerCapitaFam" IS NOT NULL
            AND "rendaPerCapitaFam" <= 810.5
        )::int AS "familiasPobrezaMeioSalario"
      FROM "CaduFamilia";`;

    return res.json({
      cards: {
        totalPessoas: Number(pessoasRow?.totalPessoas || 0),
        totalHomens: Number(pessoasRow?.totalHomens || 0),
        totalMulheres: Number(pessoasRow?.totalMulheres || 0),
        primeiraInfancia: Number(pessoasRow?.primeiraInfancia || 0),
        criancasAdolescentes: Number(pessoasRow?.criancasAdolescentes || 0),
        adolescentes: Number(pessoasRow?.adolescentes || 0),
        jovens: Number(pessoasRow?.jovens || 0),
        adultos: Number(pessoasRow?.adultos || 0),
        idosos: Number(pessoasRow?.idosos || 0),
        pessoasComDeficiencia: Number(pessoasRow?.pessoasComDeficiencia || 0),
        familiasPobrezaMeioSalario: Number(familiasRow?.familiasPobrezaMeioSalario || 0)
      }
    });
  }
);

export default router;

