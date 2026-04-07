import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const COR_TITULO = [15, 23, 42];
const COR_HEADER_TABELA = [30, 64, 175];
const COR_BORDA = [203, 213, 225];

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
  if (overview?.filtroIdUnidade) {
    const nome = nomeUnidade?.trim() || "Centro POP selecionado";
    return `Unidade: ${nome} — identificador ${overview.filtroIdUnidade}.`;
  }
  return "Escopo: todos os Centros POP do municipio com registro no periodo.";
}

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
  const suf = overview?.filtroIdUnidade
    ? String(overview.filtroIdUnidade)
    : "todas-unidades";
  return `RMA-POP-${ano}-${mes}-${suf}.pdf`;
}

/**
 * @param {object} params.overview — GET /rma-pop/overview
 * @param {Array} params.indicadores — RmaPopIndicadorDef
 */
export function exportRmaPopRelatorioPdf({
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
  doc.text("Relatorio RMA Centro POP", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Registro mensal dos Centros POP — dados importados no sistema",
    margin,
    22
  );
  doc.setTextColor(0, 0, 0);

  y = 42;

  const metaRows = [
    [
      "Origem dos dados",
      "Sistema Vigilancia SUAS — importacao dos arquivos CSV do RMA Centro POP (indicadores numericos agregados)."
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
    ["Pessoas em situacao de rua atendidas (A.1)", fmtInt(tot.a1)],
    ["Total de atendimentos no mes (D.1)", fmtInt(tot.d1)],
    ["Pessoas abordadas — Abordagem Social (E.1)", fmtInt(tot.e1)],
    ["Inclusoes no Cadastro Unico (C.1)", fmtInt(tot.c1)],
    ["Atualizacoes do Cadastro Unico (C.2)", fmtInt(tot.c2)],
    ["Adultos — crack ou outras drogas (B.1)", fmtInt(tot.b1)],
    [
      "Media de D.1 por unidade" +
        (overview.agregacao === "ano" ? " (visao anual)" : ""),
      fmtFloat(deriv.mediaD1PorUnidade, 2)
    ],
    [
      "Razao (C.1 + C.2) / A.1",
      deriv.razaoCadUnicoSobreA1 != null
        ? fmtFloat(deriv.razaoCadUnicoSobreA1, 3)
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

  const porPop = overview.porPop || [];
  if (porPop.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      overview.filtroIdUnidade
        ? "Dados do equipamento (valores destacados)"
        : "Por equipamento Centro POP (valores destacados)",
      margin,
      y
    );
    y += 5;

    const bodyUn = porPop.map((row) => {
      const d = row.destaques || {};
      return [
        row.nomeUnidade || "—",
        fmtInt(d.a1),
        fmtInt(d.d1),
        fmtInt(d.e1),
        fmtInt(d.c1),
        fmtInt(d.c2),
        fmtInt(d.b1)
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Unidade", "A.1", "D.1", "E.1", "C.1", "C.2", "B.1"]],
      body: bodyUn,
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 1.6 },
      headStyles: { fillColor: COR_HEADER_TABELA, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 44 },
        1: { halign: "right", cellWidth: 16 },
        2: { halign: "right", cellWidth: 16 },
        3: { halign: "right", cellWidth: 16 },
        4: { halign: "right", cellWidth: 16 },
        5: { halign: "right", cellWidth: 16 },
        6: { halign: "right", cellWidth: 16 }
      }
    });
  }

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Pagina ${p} de ${totalPaginas} — RMA Centro POP — confidencial / uso institucional`,
      pageW / 2,
      pageH - 6,
      { align: "center" }
    );
    doc.setTextColor(0, 0, 0);
  }

  doc.save(nomeArquivoSaida(overview));
}
