import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  getVigilanciaOverviewCards,
  listarUnidadesTerritoriaisVigilancia
} from "../services/vigilanciaOverview.service.js";

const router = Router();

// Visão geral dos cards de Vigilância (usa views já existentes)
router.get(
  "/overview",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const unidadeTerritorial = req.query?.unidadeTerritorial || null;
    const bairrosParam = req.query?.bairros;
    const bairrosArray =
      typeof bairrosParam === "string"
        ? [bairrosParam]
        : Array.isArray(bairrosParam)
        ? bairrosParam
        : [];

    try {
      const body = await getVigilanciaOverviewCards(unidadeTerritorial, bairrosArray);
      return res.json(body);
    } catch (error) {
      console.error("vigilancia overview:", error);
      return res.status(500).json({
        error: true,
        message: error?.message || "Falha ao montar overview de vigilancia",
        code: "VIGILANCIA_OVERVIEW_FAILED"
      });
    }
  }
);

// Botão de atualizar bases: cria/atualiza views de Vigilância
router.post(
  "/atualizar-bases",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const inicio = Date.now();

    try {
      // 1) Garante criação das views (uma instrução por chamada)
      const sqlCreateFamilias =
        'CREATE MATERIALIZED VIEW IF NOT EXISTS "vw_vig_familias" AS ' +
        "SELECT " +
        '  cf."codFamiliarFam" AS cod_familiar_fam, ' +
        "  NULLIF(cf.\"rawDadosTxt\"::jsonb ->> 'd.dat_cadastramento_fam', '')::date AS dat_cadastramento_fam, " +
        '  cf."dataAtualFam" AS dat_atual_fam, ' +
        "  NULLIF(cf.\"rawDadosTxt\"::jsonb ->> 'd.dta_entrevista_fam', '')::date AS dta_entrevista_fam, " +
        "  (cf.\"rawDadosTxt\"::jsonb ->> 'd.cod_forma_coleta_fam') AS cod_forma_coleta_fam, " +
        "  (cf.\"rawDadosTxt\"::jsonb ->> 'd.nom_localidade_fam') AS nom_localidade_fam, " +
        "  (cf.\"rawDadosTxt\"::jsonb ->> 'd.num_cep_logradouro_fam') AS num_cep_logradouro_fam, " +
        "  (cf.\"rawDadosTxt\"::jsonb ->> 'd.cod_unidade_territorial_fam') AS cod_unidade_territorial_fam, " +
        '  cf."rendaPerCapitaFam" AS vlr_renda_media_fam, ' +
        "(cf.\"rawDadosTxt\"::jsonb ->> 'd.vlr_renda_total_fam')::numeric AS vlr_renda_total_fam, " +
        "(cf.\"rawDadosTxt\"::jsonb ->> 'd.marc_pbf') AS marc_pbf, " +
        "((cf.\"rawDadosTxt\"::jsonb ->> 'd.marc_pbf') = '1') AS familia_recebe_pbf, " +
        "(cf.\"rawDadosTxt\"::jsonb ->> 'd.cod_familia_indigena_fam') AS cod_familia_indigena_fam, " +
        "(cf.\"rawDadosTxt\"::jsonb ->> 'd.ind_familia_quilombola_fam') AS ind_familia_quilombola_fam, " +
        "(cf.\"rawDadosTxt\"::jsonb ->> 'd.ind_risco_scl_vlco_drts') AS ind_risco_scl_vlco_drts, " +
        "(cf.\"rawDadosTxt\"::jsonb ->> 'd.ind_risco_scl_inseg_alim') AS ind_risco_scl_inseg_alim, " +
        "CASE " +
        '  WHEN cf."rendaPerCapitaFam" IS NOT NULL AND cf."rendaPerCapitaFam" <= 810.5 THEN TRUE ' +
        "  ELSE FALSE " +
        "END AS familia_pobreza_meio_salario " +
        'FROM "CaduFamilia" cf;';

      await prisma.$executeRawUnsafe(sqlCreateFamilias);

      const sqlCreatePessoas =
        'CREATE MATERIALIZED VIEW IF NOT EXISTS "vw_vig_pessoas" AS ' +
        "SELECT " +
        "  crl.id AS linha_id, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.cod_familiar_fam') AS cod_familiar_fam, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.nom_pessoa') AS nom_pessoa, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.num_nis_pessoa_atual') AS num_nis_pessoa_atual, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_trabalho_infantil_pessoa') AS ind_trabalho_infantil_pessoa, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.marc_sit_rua') AS marc_sit_rua, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.cod_sexo_pessoa') AS cod_sexo_pessoa, " +
        "NULLIF(crl.\"dadosTxt\"::jsonb ->> 'p.dta_nasc_pessoa', '')::date AS dta_nasc_pessoa, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.cod_parentesco_rf_pessoa') AS cod_parentesco_rf_pessoa, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.cod_raca_cor_pessoa') AS cod_raca_cor_pessoa, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.marc_pbf') AS marc_pbf, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_identidade_genero') AS ind_identidade_genero, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_transgenero') AS ind_transgenero, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_tipo_identidade_genero') AS ind_tipo_identidade_genero, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.cod_deficiencia_memb') AS cod_deficiencia_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_cegueira_memb') AS ind_def_cegueira_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_baixa_visao_memb') AS ind_def_baixa_visao_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_surdez_profunda_memb') AS ind_def_surdez_profunda_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_surdez_leve_memb') AS ind_def_surdez_leve_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_fisica_memb') AS ind_def_fisica_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_mental_memb') AS ind_def_mental_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_sindrome_down_memb') AS ind_def_sindrome_down_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_def_transtorno_mental_memb') AS ind_def_transtorno_mental_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.ind_frequenta_escola_memb') AS ind_frequenta_escola_memb, " +
        "(crl.\"dadosTxt\"::jsonb ->> 'p.grau_instrucao') AS grau_instrucao, " +
        "LPAD( " +
        "  REGEXP_REPLACE(crl.\"dadosTxt\"::jsonb ->> 'p.num_cpf_pessoa', '\\\\D', '', 'g'), " +
        "  11, " +
        "  '0' " +
        ") AS cpf_normalizado, " +
        "EXISTS ( " +
        "  SELECT 1 FROM \"BpcBeneficio\" b " +
        "  WHERE b.cpf = LPAD( " +
        "    REGEXP_REPLACE(crl.\"dadosTxt\"::jsonb ->> 'p.num_cpf_pessoa', '\\\\D', '', 'g'), " +
        "    11, " +
        "    '0' " +
        "  ) " +
        ") AS tem_bpc, " +
        "EXISTS ( " +
        "  SELECT 1 FROM \"BpcBeneficio\" b " +
        "  WHERE b.cpf = LPAD( " +
        "    REGEXP_REPLACE(crl.\"dadosTxt\"::jsonb ->> 'p.num_cpf_pessoa', '\\\\D', '', 'g'), " +
        "    11, " +
        "    '0' " +
        "  ) " +
        "  AND b.\"tipo\" = 'IDOSO' " +
        ") AS tem_bpc_idoso, " +
        "EXISTS ( " +
        "  SELECT 1 FROM \"BpcBeneficio\" b " +
        "  WHERE b.cpf = LPAD( " +
        "    REGEXP_REPLACE(crl.\"dadosTxt\"::jsonb ->> 'p.num_cpf_pessoa', '\\\\D', '', 'g'), " +
        "    11, " +
        "    '0' " +
        "  ) " +
        "  AND b.\"tipo\" = 'DEFICIENTE' " +
        ") AS tem_bpc_deficiencia, " +
        "CASE " +
        "  WHEN NULLIF(crl.\"dadosTxt\"::jsonb ->> 'p.dta_nasc_pessoa', '') IS NULL " +
        "    THEN NULL " +
        "  ELSE EXTRACT( " +
        "    YEAR FROM age( " +
        "      current_date, " +
        "      NULLIF(crl.\"dadosTxt\"::jsonb ->> 'p.dta_nasc_pessoa', '')::date " +
        "    ) " +
        "  )::int " +
        "END AS idade_anos " +
        'FROM "CaduRawLinha" crl;';

      await prisma.$executeRawUnsafe(sqlCreatePessoas);

      // 2) Refresh das duas views (também uma instrução por chamada)
      await prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW "vw_vig_familias";'
      );
      await prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW "vw_vig_pessoas";'
      );

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
        message:
          "Falha ao atualizar as views de vigilancia. Verifique se as views existem e tente novamente.",
        code: "VIGILANCIA_REFRESH_FAILED"
      });
    }
  }
);

// Lista de unidades territoriais (áreas/territórios) a partir da view vw_vig_familias
router.get(
  "/unidades",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (_req, res) => {
    try {
      const unidades = await listarUnidadesTerritoriaisVigilancia();
      return res.json(unidades);
    } catch (error) {
      console.error("vigilancia unidades:", error);
      return res.status(500).json({
        error: true,
        message: error?.message || "Falha ao listar unidades territoriais",
        code: "VIGILANCIA_UNIDADES_FAILED"
      });
    }
  }
);

// Lista de bairros/localidades dentro de uma unidade territorial (CRAS)
router.get(
  "/bairros",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const unidadeTerritorial = req.query?.unidadeTerritorial;

    if (!unidadeTerritorial || unidadeTerritorial === "TODOS") {
      return res.json([]);
    }

    const sqlBairros =
      'SELECT DISTINCT ' +
      '  nom_localidade_fam AS "nome" ' +
      'FROM "vw_vig_familias" ' +
      "WHERE cod_unidade_territorial_fam = $1 " +
      "  AND nom_localidade_fam IS NOT NULL " +
      "  AND nom_localidade_fam <> '' " +
      'ORDER BY "nome";';

    const bairros = await prisma.$queryRawUnsafe(sqlBairros, unidadeTerritorial);
    return res.json(bairros);
  }
);

export default router;


