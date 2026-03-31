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
        COUNT(*) FILTER (WHERE cod_sexo_pessoa = '1')::int AS "totalHomens",
        COUNT(*) FILTER (WHERE cod_sexo_pessoa = '2')::int AS "totalMulheres",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL AND idade_anos < 7
        )::int AS "primeiraInfancia",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 7 AND 15
        )::int AS "criancasAdolescentes",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 15 AND 17
        )::int AS "adolescentes",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 18 AND 29
        )::int AS "jovens",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 30 AND 59
        )::int AS "adultos",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL AND idade_anos >= 60
        )::int AS "idosos",
        COUNT(*) FILTER (
          WHERE cod_deficiencia_memb = '1'
        )::int AS "pessoasComDeficiencia",
        COUNT(*) FILTER (
          WHERE cod_deficiencia_memb = '1'
            AND (ind_def_cegueira_memb = '1' OR ind_def_baixa_visao_memb = '1')
        )::int AS "defVisual",
        COUNT(*) FILTER (
          WHERE cod_deficiencia_memb = '1'
            AND (ind_def_surdez_profunda_memb = '1' OR ind_def_surdez_leve_memb = '1')
        )::int AS "defAuditiva",
        COUNT(*) FILTER (
          WHERE cod_deficiencia_memb = '1'
            AND ind_def_fisica_memb = '1'
        )::int AS "defFisica",
        COUNT(*) FILTER (
          WHERE cod_deficiencia_memb = '1'
            AND (ind_def_mental_memb = '1' OR ind_def_sindrome_down_memb = '1')
        )::int AS "defIntelectual",
        COUNT(*) FILTER (
          WHERE cod_deficiencia_memb = '1'
            AND ind_def_transtorno_mental_memb = '1'
        )::int AS "defMental",
        COUNT(*) FILTER (
          WHERE ind_trabalho_infantil_pessoa = '1'
        )::int AS "pessoasTrabalhoInfantil",
        COUNT(*) FILTER (
          WHERE marc_sit_rua = '1'
        )::int AS "pessoasSituacaoRua",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL
            AND idade_anos BETWEEN 7 AND 15
            AND ind_frequenta_escola_memb IN ('3','4')
        )::int AS "criancasForaEscola",
        COUNT(*) FILTER (
          WHERE idade_anos IS NOT NULL
            AND idade_anos >= 18
            AND grau_instrucao IN ('1','2')
        )::int AS "adultosBaixaEscolaridade"
      FROM "vw_vig_pessoas";`;

    const [familiasRow] =
      await prisma.$queryRaw`SELECT
        COUNT(*) FILTER (
          WHERE vlr_renda_media_fam IS NOT NULL AND vlr_renda_media_fam <= 218
        )::int AS "familiasPobreza",
        COUNT(*) FILTER (
          WHERE vlr_renda_media_fam IS NOT NULL AND vlr_renda_media_fam > 218 AND vlr_renda_media_fam <= 810.14
        )::int AS "familiasBaixaRenda",
        COUNT(*) FILTER (
          WHERE vlr_renda_media_fam IS NOT NULL AND vlr_renda_media_fam > 810.14
        )::int AS "familiasAcimaMeioSalario"
      FROM "vw_vig_familias";`;

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
        defVisual: Number(pessoasRow?.defVisual || 0),
        defAuditiva: Number(pessoasRow?.defAuditiva || 0),
        defFisica: Number(pessoasRow?.defFisica || 0),
        defIntelectual: Number(pessoasRow?.defIntelectual || 0),
        defMental: Number(pessoasRow?.defMental || 0),
        pessoasTrabalhoInfantil: Number(pessoasRow?.pessoasTrabalhoInfantil || 0),
        pessoasSituacaoRua: Number(pessoasRow?.pessoasSituacaoRua || 0),
        criancasForaEscola: Number(pessoasRow?.criancasForaEscola || 0),
        adultosBaixaEscolaridade: Number(pessoasRow?.adultosBaixaEscolaridade || 0),
        familiasPobreza: Number(familiasRow?.familiasPobreza || 0),
        familiasBaixaRenda: Number(familiasRow?.familiasBaixaRenda || 0),
        familiasAcimaMeioSalario: Number(familiasRow?.familiasAcimaMeioSalario || 0)
      }
    });
  }
);

router.post(
  "/atualizar-bases",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const inicio = Date.now();
    try {
      // Garante que as materialized views existam (cria se nao existirem)
      await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'vw_vig_familias'
  ) THEN
    CREATE MATERIALIZED VIEW "vw_vig_familias" AS
    SELECT
      cf."codFamiliarFam" AS cod_familiar_fam,
      NULLIF(cf."rawDadosTxt"::jsonb ->> 'd.dat_cadastramento_fam', '')::date AS dat_cadastramento_fam,
      cf."dataAtualFam" AS dat_atual_fam,
      NULLIF(cf."rawDadosTxt"::jsonb ->> 'd.dta_entrevista_fam', '')::date AS dta_entrevista_fam,
      (cf."rawDadosTxt"::jsonb ->> 'd.cod_forma_coleta_fam') AS cod_forma_coleta_fam,
      CASE (cf."rawDadosTxt"::jsonb ->> 'd.cod_forma_coleta_fam')
        WHEN '0' THEN 'Informacao migrada como inexistente'
        WHEN '1' THEN 'Sem visita domiciliar'
        WHEN '2' THEN 'Com visita domiciliar'
        ELSE 'Nao informado'
      END AS forma_coleta_descricao,
      (cf."rawDadosTxt"::jsonb ->> 'd.nom_localidade_fam') AS nom_localidade_fam,
      (cf."rawDadosTxt"::jsonb ->> 'd.num_cep_logradouro_fam') AS num_cep_logradouro_fam,
      (cf."rawDadosTxt"::jsonb ->> 'd.cod_unidade_territorial_fam') AS cod_unidade_territorial_fam,
      cf."rendaPerCapitaFam" AS vlr_renda_media_fam,
      (cf."rawDadosTxt"::jsonb ->> 'd.vlr_renda_total_fam')::numeric AS vlr_renda_total_fam,
      (cf."rawDadosTxt"::jsonb ->> 'd.marc_pbf') AS marc_pbf,
      CASE (cf."rawDadosTxt"::jsonb ->> 'd.marc_pbf')
        WHEN '0' THEN 'Nao'
        WHEN '1' THEN 'Sim'
        ELSE 'Nao informado'
      END AS familia_recebe_pbf_descricao,
      ((cf."rawDadosTxt"::jsonb ->> 'd.marc_pbf') = '1') AS familia_recebe_pbf,
      (cf."rawDadosTxt"::jsonb ->> 'd.cod_familia_indigena_fam') AS cod_familia_indigena_fam,
      CASE (cf."rawDadosTxt"::jsonb ->> 'd.cod_familia_indigena_fam')
        WHEN '1' THEN 'Sim'
        WHEN '2' THEN 'Nao'
        ELSE 'Nao informado'
      END AS familia_indigena_descricao,
      ((cf."rawDadosTxt"::jsonb ->> 'd.cod_familia_indigena_fam') = '1') AS familia_indigena,
      (cf."rawDadosTxt"::jsonb ->> 'd.ind_familia_quilombola_fam') AS ind_familia_quilombola_fam,
      CASE (cf."rawDadosTxt"::jsonb ->> 'd.ind_familia_quilombola_fam')
        WHEN '1' THEN 'Sim'
        WHEN '2' THEN 'Nao'
        ELSE 'Nao informado'
      END AS familia_quilombola_descricao,
      ((cf."rawDadosTxt"::jsonb ->> 'd.ind_familia_quilombola_fam') = '1') AS familia_quilombola,
      (cf."rawDadosTxt"::jsonb ->> 'd.ind_risco_scl_vlco_drts') AS ind_risco_scl_vlco_drts,
      CASE (cf."rawDadosTxt"::jsonb ->> 'd.ind_risco_scl_vlco_drts')
        WHEN '1' THEN 'Sim'
        WHEN '2' THEN 'Nao'
        ELSE 'Nao informado'
      END AS familia_risco_violacao_direitos_descricao,
      ((cf."rawDadosTxt"::jsonb ->> 'd.ind_risco_scl_vlco_drts') = '1') AS familia_risco_violacao_direitos,
      (cf."rawDadosTxt"::jsonb ->> 'd.ind_risco_scl_inseg_alim') AS ind_risco_scl_inseg_alim,
      CASE (cf."rawDadosTxt"::jsonb ->> 'd.ind_risco_scl_inseg_alim')
        WHEN '1' THEN 'Sim'
        WHEN '2' THEN 'Nao'
        ELSE 'Nao informado'
      END AS familia_risco_inseg_alim_descricao,
      ((cf."rawDadosTxt"::jsonb ->> 'd.ind_risco_scl_inseg_alim') = '1') AS familia_risco_inseg_alim,
      CASE
        WHEN cf."rendaPerCapitaFam" IS NOT NULL AND cf."rendaPerCapitaFam" <= 810.5 THEN TRUE
        ELSE FALSE
      END AS familia_pobreza_meio_salario
    FROM "CaduFamilia" cf;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'vw_vig_pessoas'
  ) THEN
    CREATE MATERIALIZED VIEW "vw_vig_pessoas" AS
    SELECT
      crl.id AS linha_id,
      (crl."dadosTxt"::jsonb ->> 'p.cod_familiar_fam') AS cod_familiar_fam,
      (crl."dadosTxt"::jsonb ->> 'p.nom_pessoa') AS nom_pessoa,
      (crl."dadosTxt"::jsonb ->> 'p.num_nis_pessoa_atual') AS num_nis_pessoa_atual,
      (crl."dadosTxt"::jsonb ->> 'p.ind_trabalho_infantil_pessoa') AS ind_trabalho_infantil_pessoa,
      (crl."dadosTxt"::jsonb ->> 'p.marc_sit_rua') AS marc_sit_rua,
      (crl."dadosTxt"::jsonb ->> 'p.cod_sexo_pessoa') AS cod_sexo_pessoa,
      NULLIF(crl."dadosTxt"::jsonb ->> 'p.dta_nasc_pessoa', '')::date AS dta_nasc_pessoa,
      (crl."dadosTxt"::jsonb ->> 'p.cod_parentesco_rf_pessoa') AS cod_parentesco_rf_pessoa,
      (crl."dadosTxt"::jsonb ->> 'p.cod_raca_cor_pessoa') AS cod_raca_cor_pessoa,
      (crl."dadosTxt"::jsonb ->> 'p.marc_pbf') AS marc_pbf,
      (crl."dadosTxt"::jsonb ->> 'p.ind_identidade_genero') AS ind_identidade_genero,
      (crl."dadosTxt"::jsonb ->> 'p.ind_transgenero') AS ind_transgenero,
      (crl."dadosTxt"::jsonb ->> 'p.ind_tipo_identidade_genero') AS ind_tipo_identidade_genero,
      (crl."dadosTxt"::jsonb ->> 'p.cod_deficiencia_memb') AS cod_deficiencia_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_cegueira_memb') AS ind_def_cegueira_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_baixa_visao_memb') AS ind_def_baixa_visao_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_surdez_profunda_memb') AS ind_def_surdez_profunda_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_surdez_leve_memb') AS ind_def_surdez_leve_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_fisica_memb') AS ind_def_fisica_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_mental_memb') AS ind_def_mental_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_sindrome_down_memb') AS ind_def_sindrome_down_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_def_transtorno_mental_memb') AS ind_def_transtorno_mental_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_ajuda_nao_memb') AS ind_ajuda_nao_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_ajuda_familia_memb') AS ind_ajuda_familia_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_ajuda_especializado_memb') AS ind_ajuda_especializado_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_ajuda_vizinho_memb') AS ind_ajuda_vizinho_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_ajuda_instituicao_memb') AS ind_ajuda_instituicao_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_ajuda_outra_memb') AS ind_ajuda_outra_memb,
      (crl."dadosTxt"::jsonb ->> 'p.cod_sabe_ler_escrever_memb') AS cod_sabe_ler_escrever_memb,
      (crl."dadosTxt"::jsonb ->> 'p.ind_frequenta_escola_memb') AS ind_frequenta_escola_memb,
      (crl."dadosTxt"::jsonb ->> 'p.nom_escola_memb') AS nom_escola_memb,
      (crl."dadosTxt"::jsonb ->> 'p.cod_escola_local_memb') AS cod_escola_local_memb,
      (crl."dadosTxt"::jsonb ->> 'p.cod_curso_frequenta_memb') AS cod_curso_frequenta_memb,
      (crl."dadosTxt"::jsonb ->> 'p.grau_instrucao') AS grau_instrucao,
      LPAD(
        REGEXP_REPLACE(crl."dadosTxt"::jsonb ->> 'p.num_cpf_pessoa', '\\D', '', 'g'),
        11,
        '0'
      ) AS cpf_normalizado,
      EXISTS (
        SELECT 1 FROM "BpcBeneficio" b
        WHERE b.cpf = LPAD(
          REGEXP_REPLACE(crl."dadosTxt"::jsonb ->> 'p.num_cpf_pessoa', '\\D', '', 'g'),
          11,
          '0'
        )
      ) AS tem_bpc,
      EXISTS (
        SELECT 1 FROM "BpcBeneficio" b
        WHERE b.cpf = LPAD(
          REGEXP_REPLACE(crl."dadosTxt"::jsonb ->> 'p.num_cpf_pessoa', '\\D', '', 'g'),
          11,
          '0'
        )
          AND b."tipo" = 'IDOSO'
      ) AS tem_bpc_idoso,
      EXISTS (
        SELECT 1 FROM "BpcBeneficio" b
        WHERE b.cpf = LPAD(
          REGEXP_REPLACE(crl."dadosTxt"::jsonb ->> 'p.num_cpf_pessoa', '\\D', '', 'g'),
          11,
          '0'
        )
          AND b."tipo" = 'DEFICIENTE'
      ) AS tem_bpc_deficiencia,
      CASE
        WHEN NULLIF(crl."dadosTxt"::jsonb ->> 'p.dta_nasc_pessoa', '') IS NULL
          THEN NULL
        ELSE EXTRACT(
          YEAR FROM age(
            current_date,
            NULLIF(crl."dadosTxt"::jsonb ->> 'p.dta_nasc_pessoa', '')::date
          )
        )::int
      END AS idade_anos
    FROM "CaduRawLinha" crl;
  END IF;
END $$;
      `);

      await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW "vw_vig_familias";`);
      await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW "vw_vig_pessoas";`);

      const fim = Date.now();

      await prisma.logAuditoria.create({
        data: {
          usuarioId: req.user.sub,
          acao: "REFRESH_VIEWS_VIGILANCIA",
          detalhes: {
            duracaoMs: fim - inicio
          }
        }
      });

      return res.json({
        ok: true,
        duracaoMs: fim - inicio
      });
    } catch (error) {
      console.error("Erro ao atualizar views de vigilancia:", error);
      return res.status(500).json({
        error: true,
        message: "Falha ao atualizar as views de vigilancia. Verifique se as views existem e tente novamente.",
        code: "VIGILANCIA_REFRESH_FAILED"
      });
    }
  }
);

export default router;

