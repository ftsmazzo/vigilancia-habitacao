import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

function formatNomeUnidadeTerritorial(codigo) {
  if (!codigo) return "Sem unidade territorial";
  const n = parseInt(codigo, 10);
  if (Number.isNaN(n)) return codigo;
  if (n === 9) return "CRAS Bonfim Paulista";
  const numero = String(n).padStart(2, "0");
  return `CRAS ${numero}`;
}

// Visão geral dos cards de Vigilância (usa views já existentes)
router.get(
  "/overview",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const unidadeTerritorial = req.query?.unidadeTerritorial || null;
    // bairros pode vir como string unica ou array de strings (?bairros=a&bairros=b)
    const bairrosParam = req.query?.bairros;
    const bairrosArray =
      typeof bairrosParam === "string"
        ? [bairrosParam]
        : Array.isArray(bairrosParam)
        ? bairrosParam
        : [];

    const sqlPessoasBase =
      "SELECT " +
      '  COUNT(*) FILTER (WHERE cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "totalPessoas",' +
      '  COUNT(*) FILTER (WHERE cod_sexo_pessoa = \'1\' AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "totalHomens",' +
      '  COUNT(*) FILTER (WHERE cod_sexo_pessoa = \'2\' AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "totalMulheres",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos < 7 AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "primeiraInfancia",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 7 AND 15 AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "criancasAdolescentes",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 15 AND 17 AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "adolescentes",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 18 AND 29 AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "jovens",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 30 AND 59 AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "adultos",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos >= 60 AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "idosos",' +
      '  COUNT(*) FILTER (WHERE cod_deficiencia_memb = \'1\' AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "pessoasComDeficiencia",' +
      '  COUNT(*) FILTER (WHERE cod_deficiencia_memb = \'1\' AND (ind_def_cegueira_memb = \'1\' OR ind_def_baixa_visao_memb = \'1\') AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "defVisual",' +
      '  COUNT(*) FILTER (WHERE cod_deficiencia_memb = \'1\' AND (ind_def_surdez_profunda_memb = \'1\' OR ind_def_surdez_leve_memb = \'1\') AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "defAuditiva",' +
      '  COUNT(*) FILTER (WHERE cod_deficiencia_memb = \'1\' AND ind_def_fisica_memb = \'1\' AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "defFisica",' +
      '  COUNT(*) FILTER (WHERE cod_deficiencia_memb = \'1\' AND (ind_def_mental_memb = \'1\' OR ind_def_sindrome_down_memb = \'1\') AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "defIntelectual",' +
      '  COUNT(*) FILTER (WHERE cod_deficiencia_memb = \'1\' AND ind_def_transtorno_mental_memb = \'1\' AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "defMental",' +
      '  COUNT(*) FILTER (WHERE ind_trabalho_infantil_pessoa = \'1\' AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "pessoasTrabalhoInfantil",' +
      '  COUNT(*) FILTER (WHERE marc_sit_rua = \'1\' AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "pessoasSituacaoRua",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos BETWEEN 7 AND 15 AND ind_frequenta_escola_memb IN (\'3\',\'4\') AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "criancasForaEscola",' +
      '  COUNT(*) FILTER (WHERE idade_anos IS NOT NULL AND idade_anos >= 18 AND grau_instrucao IN (\'1\',\'2\') AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "adultosBaixaEscolaridade",' +
      '  COUNT(*) FILTER (WHERE tem_bpc AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "pessoasComBpc",' +
      '  COUNT(*) FILTER (WHERE tem_bpc_idoso AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "pessoasBpcIdoso",' +
      '  COUNT(*) FILTER (WHERE tem_bpc_deficiencia AND cod_familiar_fam IN (SELECT cod_familiar_fam FROM fam))::int AS "pessoasBpcDeficiencia" ' +
      'FROM "vw_vig_pessoas";';

    let pessoasRow;
    if (!bairrosArray.length) {
      const [row] = await prisma.$queryRawUnsafe(
        "WITH fam AS (" +
          "  SELECT cod_familiar_fam" +
          '  FROM "vw_vig_familias"' +
          "  WHERE ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          ") " +
          sqlPessoasBase,
        unidadeTerritorial
      );
      pessoasRow = row;
    } else {
      const [row] = await prisma.$queryRawUnsafe(
        "WITH fam AS (" +
          "  SELECT cod_familiar_fam" +
          '  FROM "vw_vig_familias"' +
          "  WHERE ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "    AND nom_localidade_fam = ANY($2::text[])" +
          ") " +
          sqlPessoasBase,
        unidadeTerritorial,
        bairrosArray
      );
      pessoasRow = row;
    }

    const sqlFamiliasBase =
      "SELECT " +
      '  COUNT(*) FILTER (' +
      "    WHERE ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
      "  )::int AS \"totalFamilias\"," +
      '  COUNT(*) FILTER (' +
      "    WHERE vlr_renda_media_fam IS NOT NULL " +
      "      AND vlr_renda_media_fam <= 218 " +
      "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
      "  )::int AS \"familiasPobreza\"," +
      '  COUNT(*) FILTER (' +
      "    WHERE vlr_renda_media_fam IS NOT NULL " +
      "      AND vlr_renda_media_fam > 218 " +
      "      AND vlr_renda_media_fam <= 810.14 " +
      "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
      "  )::int AS \"familiasBaixaRenda\"," +
      '  COUNT(*) FILTER (' +
      "    WHERE vlr_renda_media_fam IS NOT NULL " +
      "      AND vlr_renda_media_fam > 810.14 " +
      "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
      "  )::int AS \"familiasAcimaMeioSalario\"," +
      '  COUNT(*) FILTER (' +
      "    WHERE familia_recebe_pbf " +
      "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
      "  )::int AS \"familiasComPbf\"," +
      '  COUNT(*) FILTER (' +
      "    WHERE ind_risco_scl_vlco_drts = '1' " +
      "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
      "  )::int AS \"familiasRiscoViolacao\"," +
      '  COUNT(*) FILTER (' +
      "    WHERE ind_risco_scl_inseg_alim = '1' " +
      "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
      "  )::int AS \"familiasInsegurancaAlimentar\" " +
      'FROM "vw_vig_familias";';

    let familiasRow;
    if (!bairrosArray.length) {
      const [row] = await prisma.$queryRawUnsafe(
        sqlFamiliasBase,
        unidadeTerritorial
      );
      familiasRow = row;
    } else {
      const [row] = await prisma.$queryRawUnsafe(
        "SELECT " +
          '  COUNT(*) FILTER (' +
          "    WHERE ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "      AND nom_localidade_fam = ANY($2::text[])" +
          "  )::int AS \"totalFamilias\"," +
          '  COUNT(*) FILTER (' +
          "    WHERE vlr_renda_media_fam IS NOT NULL " +
          "      AND vlr_renda_media_fam <= 218 " +
          "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "      AND nom_localidade_fam = ANY($2::text[])" +
          "  )::int AS \"familiasPobreza\"," +
          '  COUNT(*) FILTER (' +
          "    WHERE vlr_renda_media_fam IS NOT NULL " +
          "      AND vlr_renda_media_fam > 218 " +
          "      AND vlr_renda_media_fam <= 810.14 " +
          "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "      AND nom_localidade_fam = ANY($2::text[])" +
          "  )::int AS \"familiasBaixaRenda\"," +
          '  COUNT(*) FILTER (' +
          "    WHERE vlr_renda_media_fam IS NOT NULL " +
          "      AND vlr_renda_media_fam > 810.14 " +
          "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "      AND nom_localidade_fam = ANY($2::text[])" +
          "  )::int AS \"familiasAcimaMeioSalario\"," +
          '  COUNT(*) FILTER (' +
          "    WHERE familia_recebe_pbf " +
          "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "      AND nom_localidade_fam = ANY($2::text[])" +
          "  )::int AS \"familiasComPbf\"," +
          '  COUNT(*) FILTER (' +
          "    WHERE ind_risco_scl_vlco_drts = '1' " +
          "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "      AND nom_localidade_fam = ANY($2::text[])" +
          "  )::int AS \"familiasRiscoViolacao\"," +
          '  COUNT(*) FILTER (' +
          "    WHERE ind_risco_scl_inseg_alim = '1' " +
          "      AND ($1::text IS NULL OR $1 = 'TODOS' OR cod_unidade_territorial_fam = $1)" +
          "      AND nom_localidade_fam = ANY($2::text[])" +
          "  )::int AS \"familiasInsegurancaAlimentar\" " +
          'FROM "vw_vig_familias";',
        unidadeTerritorial,
        bairrosArray
      );
      familiasRow = row;
    }

    return res.json({
      cards: {
        totalPessoas: Number(pessoasRow?.totalPessoas || 0),
        totalFamilias: Number(familiasRow?.totalFamilias || 0),
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
        pessoasTrabalhoInfantil: Number(
          pessoasRow?.pessoasTrabalhoInfantil || 0
        ),
        pessoasSituacaoRua: Number(pessoasRow?.pessoasSituacaoRua || 0),
        criancasForaEscola: Number(pessoasRow?.criancasForaEscola || 0),
        adultosBaixaEscolaridade: Number(
          pessoasRow?.adultosBaixaEscolaridade || 0
        ),
        pessoasComBpc: Number(pessoasRow?.pessoasComBpc || 0),
        pessoasBpcIdoso: Number(pessoasRow?.pessoasBpcIdoso || 0),
        pessoasBpcDeficiencia: Number(
          pessoasRow?.pessoasBpcDeficiencia || 0
        ),
        familiasPobreza: Number(familiasRow?.familiasPobreza || 0),
        familiasBaixaRenda: Number(familiasRow?.familiasBaixaRenda || 0),
        familiasAcimaMeioSalario: Number(
          familiasRow?.familiasAcimaMeioSalario || 0
        ),
        familiasComPbf: Number(familiasRow?.familiasComPbf || 0),
        familiasRiscoViolacao: Number(
          familiasRow?.familiasRiscoViolacao || 0
        ),
        familiasInsegurancaAlimentar: Number(
          familiasRow?.familiasInsegurancaAlimentar || 0
        )
      }
    });
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
    const sqlUnidades =
      'SELECT DISTINCT ' +
      '  cod_unidade_territorial_fam AS "codigo" ' +
      'FROM "vw_vig_familias" ' +
      "WHERE cod_unidade_territorial_fam IS NOT NULL " +
      "  AND cod_unidade_territorial_fam <> '' " +
      "ORDER BY cod_unidade_territorial_fam;";

    const unidadesBrutas = await prisma.$queryRawUnsafe(sqlUnidades);
    const unidades = unidadesBrutas.map((u) => ({
      codigo: u.codigo,
      nome: formatNomeUnidadeTerritorial(u.codigo)
    }));

    return res.json(unidades);
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


