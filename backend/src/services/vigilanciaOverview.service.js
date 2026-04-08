import { prisma } from "../utils/prisma.js";

export function formatNomeUnidadeTerritorial(codigo) {
  if (!codigo) return "Sem unidade territorial";
  const n = parseInt(codigo, 10);
  if (Number.isNaN(n)) return codigo;
  if (n === 9) return "CRAS Bonfim Paulista";
  const numero = String(n).padStart(2, "0");
  return `CRAS ${numero}`;
}

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

function cardsFromRows(pessoasRow, familiasRow) {
  return {
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
    pessoasTrabalhoInfantil: Number(pessoasRow?.pessoasTrabalhoInfantil || 0),
    pessoasSituacaoRua: Number(pessoasRow?.pessoasSituacaoRua || 0),
    criancasForaEscola: Number(pessoasRow?.criancasForaEscola || 0),
    adultosBaixaEscolaridade: Number(pessoasRow?.adultosBaixaEscolaridade || 0),
    pessoasComBpc: Number(pessoasRow?.pessoasComBpc || 0),
    pessoasBpcIdoso: Number(pessoasRow?.pessoasBpcIdoso || 0),
    pessoasBpcDeficiencia: Number(pessoasRow?.pessoasBpcDeficiencia || 0),
    familiasPobreza: Number(familiasRow?.familiasPobreza || 0),
    familiasBaixaRenda: Number(familiasRow?.familiasBaixaRenda || 0),
    familiasAcimaMeioSalario: Number(familiasRow?.familiasAcimaMeioSalario || 0),
    familiasComPbf: Number(familiasRow?.familiasComPbf || 0),
    familiasRiscoViolacao: Number(familiasRow?.familiasRiscoViolacao || 0),
    familiasInsegurancaAlimentar: Number(familiasRow?.familiasInsegurancaAlimentar || 0)
  };
}

/**
 * Mesmos cards do GET /vigilancia/overview (painel CADU).
 * @param {string|null} unidadeTerritorial - null ou "TODOS" = municipio inteiro; senao codigo do CRAS.
 * @param {string[]} bairrosArray - filtro de localidade (opcional)
 */
export async function getVigilanciaOverviewCards(unidadeTerritorial, bairrosArray = []) {
  const bairros = Array.isArray(bairrosArray) ? bairrosArray : [];

  let pessoasRow;
  if (!bairros.length) {
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
      bairros
    );
    pessoasRow = row;
  }

  let familiasRow;
  if (!bairros.length) {
    const [row] = await prisma.$queryRawUnsafe(sqlFamiliasBase, unidadeTerritorial);
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
      bairros
    );
    familiasRow = row;
  }

  return { cards: cardsFromRows(pessoasRow, familiasRow) };
}

export async function listarUnidadesTerritoriaisVigilancia() {
  const sqlUnidades =
    'SELECT DISTINCT ' +
    '  cod_unidade_territorial_fam AS "codigo" ' +
    'FROM "vw_vig_familias" ' +
    "WHERE cod_unidade_territorial_fam IS NOT NULL " +
    "  AND cod_unidade_territorial_fam <> '' " +
    "ORDER BY cod_unidade_territorial_fam;";

  const unidadesBrutas = await prisma.$queryRawUnsafe(sqlUnidades);
  return unidadesBrutas.map((u) => ({
    codigo: u.codigo,
    nome: formatNomeUnidadeTerritorial(u.codigo)
  }));
}
