import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const COR_TITULO = [15, 23, 42];
const COR_HEADER_TABELA = [30, 64, 175];
const COR_BORDA = [203, 213, 225];

const KPI_RESUMO = [
  { key: "a1", label: "Casos em acompanhamento PAEFI (A.1)" },
  { key: "a2", label: "Novos casos PAEFI (A.2)" },
  { key: "b1", label: "Familias no Bolsa Familia (B.1)" },
  { key: "c1", label: "Violencia intrafamiliar — criancas (C.1)" },
  { key: "m1", label: "Atendimentos individualizados (M.1)" },
  { key: "m4", label: "Visitas domiciliares (M.4)" }
];

function fmtInt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(Number(n)));
}

function fmtFloat(n, dec = 3) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  }).format(Number(n));
}

function textoPeriodo(overview) {
  if (!overview?.periodo) return "—";
  const ano = overview.periodo.ano;
  if (overview.agregacao === "ano") {
    return `Ano civil ${ano} (agregacao: soma dos meses com dados importados)`;
  }
  const mes = overview.periodo.mes;
  if (mes == null) return `—`;
  return `${String(mes).padStart(2, "0")}/${ano} (mes de referencia)`;
}

function textoEscopo(overview, nomeUnidade) {
  if (overview?.filtroIdCreas) {
    const nome = nomeUnidade?.trim() || "CREAS selecionado";
    return `Unidade: ${nome} — identificador ${overview.filtroIdCreas}.`;
  }
  return "Escopo: todos os equipamentos CREAS do municipio com registro no periodo.";
}

/**
 * Indicadores com valor numerico e diferente de zero (leitura mais limpa).
 */
function linhasIndicadoresComValor(totais, indicadores) {
  const out = [];
  for (const ind of indicadores) {
    const raw = totais[ind.codigo];
    if (raw == null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (n === 0) continue;
    out.push([ind.rotulo || ind.codigo, fmtInt(n)]);
  }
  return out;
}

function nomeArquivoSaida(overview) {
  const ano = overview?.periodo?.ano ?? "ano";
  const mes =
    overview?.agregacao === "ano"
      ? "ano-completo"
      : String(overview?.periodo?.mes ?? "mes").padStart(2, "0");
  const suf = overview?.filtroIdCreas ? String(overview.filtroIdCreas) : "todas-unidades";
  return `RMA-CREAS-${ano}-${mes}-${suf}.pdf`;
}

/**
 * @param {object} params
 * @param {object} params.overview — resposta GET /rma-creas/overview
 * @param {Array} params.indicadores — lista de RmaCreasIndicadorDef
 * @param {string} [params.nomeUnidadeSelecionada] — nome do CREAS quando filtrado
 */
export function exportRmaCreasRelatorioPdf({
  overview,
  indicadores,
  nomeUnidadeSelecionada
}) {
  if (!overview) return;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  const tot = overview.totaisMunicipio || {};
  const deriv = overview.derivados || {};
  const emitido = new Date();
  const emitidoStr = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(emitido);

  doc.setFillColor(...COR_TITULO);
  doc.rect(0, 0, pageW, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Relatorio RMA CREAS", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Registro mensal dos equipamentos CREAS — dados importados no sistema",
    margin,
    22
  );
  doc.setTextColor(0, 0, 0);

  y = 42;

  const metaRows = [
    [
      "Origem dos dados",
      "Sistema Vigilancia SUAS — importacao dos arquivos CSV do RMA CREAS (indicadores numericos agregados)."
    ],
    ["Escopo", textoEscopo(overview, nomeUnidadeSelecionada)],
    ["Periodo", textoPeriodo(overview)],
    [
      "Referencia temporal (API)",
      overview.periodo?.mesReferencia
        ? new Date(overview.periodo.mesReferencia).toLocaleDateString("pt-BR")
        : overview.periodo?.mesReferenciaInicio && overview.periodo?.mesReferenciaFim
          ? `${new Date(overview.periodo.mesReferenciaInicio).toLocaleDateString("pt-BR")} a ${new Date(overview.periodo.mesReferenciaFim).toLocaleDateString("pt-BR")}`
          : "—"
    ],
    ["Unidades no recorte", String(overview.quantidadeUnidades ?? "—")],
    ["Emissao do documento", emitidoStr]
  ];

  autoTable(doc, {
    startY: y,
    head: [["Campo", "Descricao"]],
    body: metaRows,
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      lineColor: COR_BORDA,
      lineWidth: 0.15,
      valign: "top"
    },
    headStyles: {
      fillColor: COR_HEADER_TABELA,
      textColor: 255,
      fontStyle: "bold"
    },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: pageW - margin * 2 - 38 }
    },
    margin: { left: margin, right: margin },
    tableLineColor: COR_BORDA,
    tableLineWidth: 0.1
  });

  y = doc.lastAutoTable.finalY + 8;

  if (overview.aviso) {
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    const avisoLines = doc.splitTextToSize(String(overview.aviso), pageW - margin * 2);
    doc.text(avisoLines, margin, y);
    y += avisoLines.length * 3.6 + 6;
    doc.setTextColor(0, 0, 0);
  }

  const bodyResumo = [
    ...KPI_RESUMO.map((k) => [k.label, fmtInt(tot[k.key])]),
    [
      "Media de M.1 por unidade" +
        (overview.agregacao === "ano" ? " (visao anual)" : ""),
      fmtFloat(deriv.mediaAtendimentosIndivPorUnidade, 2)
    ],
    [
      "Razao novos casos (A.2) / acompanhamento (A.1)",
      deriv.razaoNovosCasosSobreAcompanhamento != null
        ? fmtFloat(deriv.razaoNovosCasosSobreAcompanhamento, 3)
        : "—"
    ]
  ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumo numerico", margin, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Valor"]],
    body: bodyResumo,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: COR_HEADER_TABELA, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: pageW - margin * 2 - 32 },
      1: { halign: "right", cellWidth: 32 }
    }
  });

  y = doc.lastAutoTable.finalY + 10;

  const linhasInd = linhasIndicadoresComValor(tot, indicadores || []);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Indicadores detalhados (apenas totais com valor diferente de zero)", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(
    "Indicadores com total zero foram omitidos para manter o relatorio objetivo.",
    margin,
    y
  );
  y += 5;
  doc.setTextColor(0, 0, 0);

  if (linhasInd.length === 0) {
    doc.setFontSize(9);
    doc.text("Nenhum indicador com total diferente de zero neste recorte.", margin, y);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Total"]],
      body: linhasInd,
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: COR_HEADER_TABELA, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: pageW - margin * 2 - 28 },
        1: { halign: "right", cellWidth: 28 }
      }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const porCreas = overview.porCreas || [];
  if (porCreas.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      overview.filtroIdCreas
        ? "Dados do equipamento (valores destacados)"
        : "Por equipamento CREAS (valores destacados)",
      margin,
      y
    );
    y += 5;

    const bodyUn = porCreas.map((row) => {
      const d = row.destaques || {};
      return [
        row.nomeUnidade || "—",
        fmtInt(d.a1),
        fmtInt(d.a2),
        fmtInt(d.m1),
        fmtInt(d.m4),
        fmtInt(d.c1)
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Unidade", "A.1", "A.2", "M.1", "M.4", "C.1"]],
      body: bodyUn,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: COR_HEADER_TABELA, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { halign: "right", cellWidth: 18 },
        2: { halign: "right", cellWidth: 18 },
        3: { halign: "right", cellWidth: 18 },
        4: { halign: "right", cellWidth: 18 },
        5: { halign: "right", cellWidth: 18 }
      }
    });
  }

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Pagina ${p} de ${totalPaginas} — RMA CREAS — confidencial / uso institucional`,
      pageW / 2,
      pageH - 6,
      { align: "center" }
    );
    doc.setTextColor(0, 0, 0);
  }

  doc.save(nomeArquivoSaida(overview));
}
