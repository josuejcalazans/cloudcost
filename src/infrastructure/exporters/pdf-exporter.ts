import PDFDocument from 'pdfkit';
import type {
  ExportContext,
  ReportExporter,
} from '../../application/ports/exporter.ts';
import type {
  CostReport,
  ReportGroup,
} from '../../domain/aggregates/cost-report.ts';

const MARGIN = 48;
const FOOTER_RESERVE = 40;
const INK = '#1f2937';
const BLUE = '#1a73e8';
const GREEN = '#137333';
const RED = '#c74634';
const GREY = '#6b7280';
const LIGHT = '#f8fafc';
const BORDER = '#e5e7eb';
const ROW_ALT = '#f3f4f6';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '\u20ac',
  BRL: 'R$',
};

function money(amount: number, currency: string): string {
  const [whole, decimals] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = amount < 0 ? '-' : '';
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${sign}${symbol}${grouped}.${decimals}`;
}

function signedMoney(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : '+';
  return `${sign}${money(Math.abs(amount), currency)}`;
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function dayBefore(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  return new Date(ms - 86_400_000).toISOString().slice(0, 10);
}

function rangeLabel(report: CostReport): string {
  return `${report.range.from} - ${dayBefore(report.range.to)}`;
}

function providerLabel(report: CostReport): string {
  const provider = report.records[0]?.provider;
  switch (provider) {
    case 'oci':
      return 'Oracle Cloud Infrastructure (oci)';
    case 'aws':
      return 'Amazon Web Services (aws)';
    default:
      return provider ?? 'multi-cloud';
  }
}

function dailySeries(
  report: CostReport,
): Array<{ date: string; amount: number }> {
  const byDate = new Map<string, number>();
  for (const record of report.records) {
    byDate.set(record.date, (byDate.get(record.date) ?? 0) + record.amount);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, amount]) => ({ date, amount }));
}

interface ChangeCell {
  text: string;
  color: string;
}

function changeCell(current: number, before: number | undefined): ChangeCell {
  if (before === undefined || before === 0) {
    return { text: 'n/a', color: GREY };
  }
  const ratio = (current - before) / before;
  const sign = ratio < 0 ? '-' : '+';
  return {
    text: `${sign}${Math.abs(ratio * 100).toFixed(1)}%`,
    color: ratio < 0 ? GREEN : RED,
  };
}

async function renderPdf(
  report: CostReport,
  context?: ExportContext,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    compress: false,
    info: {
      Title: context?.title ?? 'Cloud cost report',
      Author: 'cloudcost',
      Producer: 'cloudcost',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = () => doc.page.width;
  const pageHeight = () => doc.page.height;
  const contentWidth = () => pageWidth() - 2 * MARGIN;
  let y = MARGIN;

  const ensure = (height: number): void => {
    if (y + height > pageHeight() - FOOTER_RESERVE) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const sectionTitle = (text: string): void => {
    ensure(24);
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(text, MARGIN, y, { width: contentWidth() });
    y += 18;
  };

  // --- header ----------------------------------------------------------
  const title = context?.title ?? 'Cloud cost report';
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(title, MARGIN, y, { width: contentWidth() });
  y += 26;
  doc
    .fillColor(GREY)
    .font('Helvetica')
    .fontSize(9)
    .text(
      `${providerLabel(report)}  ·  ${rangeLabel(report)}  ·  ${report.currency}`,
      MARGIN,
      y,
      { width: contentWidth() },
    );
  y += 14;
  doc
    .fillColor(GREY)
    .fontSize(8)
    .text(
      `Generated ${report.generatedAt.slice(0, 10)} from the usage APIs`,
      MARGIN,
      y,
      {
        width: contentWidth(),
      },
    );
  y += 13;
  doc
    .moveTo(MARGIN, y)
    .lineTo(pageWidth() - MARGIN, y)
    .lineWidth(2)
    .stroke(BLUE);
  y += 18;

  // --- KPI boxes -------------------------------------------------------
  const days = Math.max(
    1,
    Math.round(
      (Date.parse(`${report.range.to}T00:00:00.000Z`) -
        Date.parse(`${report.range.from}T00:00:00.000Z`)) /
        86_400_000,
    ),
  );
  const comparison = context?.comparison;
  const change =
    comparison === undefined || comparison.total === 0
      ? undefined
      : (report.total - comparison.total) / comparison.total;

  const boxes = [
    {
      label: 'TOTAL',
      value: money(report.total, report.currency),
      sub: report.currency,
      accent: BLUE,
      color: INK,
    },
    {
      label: 'DAYS',
      value: String(days),
      sub: 'calendar days',
      accent: BLUE,
      color: INK,
    },
    {
      label: 'AVG / DAY',
      value: money(report.total / days, report.currency),
      sub: `over ${days} days`,
      accent: BLUE,
      color: INK,
    },
    change === undefined
      ? {
          label: 'GROUPS',
          value: String(report.groups.length),
          sub: `by ${report.groupBy}`,
          accent: BLUE,
          color: INK,
        }
      : {
          label: 'VS COMPARISON',
          value: percent(change),
          sub: change < 0 ? 'reduction' : 'increase',
          accent: change < 0 ? GREEN : RED,
          color: change < 0 ? GREEN : RED,
        },
  ];

  const boxGap = 8;
  const boxHeight = 54;
  const boxWidth = (contentWidth() - boxGap * 3) / 4;
  ensure(boxHeight + 8);
  for (const [index, box] of boxes.entries()) {
    const x = MARGIN + index * (boxWidth + boxGap);
    doc.roundedRect(x, y, boxWidth, boxHeight, 3).fill(LIGHT);
    doc.rect(x, y, boxWidth, 3).fill(box.accent);
    doc
      .fillColor(GREY)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(box.label, x + 8, y + 11, { width: boxWidth - 16 });
    doc
      .fillColor(box.color)
      .font('Helvetica-Bold')
      .fontSize(box.value.length > 8 ? 12 : 15)
      .text(box.value, x + 8, y + 23, { width: boxWidth - 16, ellipsis: true });
    doc
      .fillColor(GREY)
      .font('Helvetica')
      .fontSize(7)
      .text(box.sub, x + 8, y + 41, { width: boxWidth - 16, ellipsis: true });
  }
  y += boxHeight + 18;

  // --- daily bar chart -------------------------------------------------
  const series = dailySeries(report);
  if (series.length >= 2) {
    sectionTitle('Daily cost');
    const labelGap = 10;
    const chartHeight = 110;
    ensure(labelGap + chartHeight + 36);

    const chartTop = y + labelGap;
    const baseline = chartTop + chartHeight;
    const max = Math.max(...series.map((point) => point.amount), 0.01);
    const average =
      series.reduce((sum, point) => sum + point.amount, 0) / series.length;
    const slot = contentWidth() / series.length;
    const barWidth = Math.max(3, Math.min(slot * 0.55, 24));
    const showValues = series.length <= 12;
    const labelStep = Math.max(1, Math.ceil(series.length / 14));

    for (const [index, point] of series.entries()) {
      const barHeight = Math.max(1, (point.amount / max) * chartHeight);
      const x = MARGIN + index * slot + (slot - barWidth) / 2;
      const top = chartTop + chartHeight - barHeight;
      doc
        .rect(x, top, barWidth, barHeight)
        .fill(point.amount > average ? RED : GREEN);
      if (showValues) {
        doc
          .fillColor(INK)
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(money(point.amount, report.currency), x - slot / 2, top - 9, {
            width: slot,
            align: 'center',
          });
      }
      if (index % labelStep === 0) {
        doc
          .fillColor(GREY)
          .font('Helvetica')
          .fontSize(6)
          .text(
            point.date.slice(5).replace('-', '/'),
            x - slot / 2,
            baseline + 5,
            {
              width: slot,
              align: 'center',
            },
          );
      }
    }
    doc
      .moveTo(MARGIN, baseline)
      .lineTo(pageWidth() - MARGIN, baseline)
      .lineWidth(0.8)
      .stroke(INK);
    y = baseline + 22;
  }

  // --- grouped table ---------------------------------------------------
  sectionTitle(`Cost by ${report.groupBy}`);
  const hasComparison = comparison !== undefined;
  const columns = hasComparison
    ? [
        { label: 'Group', width: 0.4, align: 'left' as const },
        { label: 'Amount', width: 0.17, align: 'right' as const },
        { label: 'Share', width: 0.11, align: 'right' as const },
        { label: 'Before', width: 0.16, align: 'right' as const },
        { label: 'Change', width: 0.16, align: 'right' as const },
      ]
    : [
        { label: 'Group', width: 0.56, align: 'left' as const },
        { label: 'Amount', width: 0.26, align: 'right' as const },
        { label: 'Share', width: 0.18, align: 'right' as const },
      ];

  const comparisonByKey = new Map<string, ReportGroup>(
    (comparison?.groups ?? []).map((group) => [group.key, group]),
  );
  const shown = report.groups.slice(0, 12);
  const hidden = report.groups.slice(12);
  const rows = [...shown];
  if (hidden.length > 0) {
    rows.push({
      key: `Other (${hidden.length} groups)`,
      amount: hidden.reduce((sum, group) => sum + group.amount, 0),
      share: hidden.reduce((sum, group) => sum + group.share, 0),
    });
  }

  const headerHeight = 16;
  const rowHeight = 15;
  const totalRowHeight = 17;
  ensure(headerHeight + rowHeight * rows.length + totalRowHeight + 8);

  let prefix = 0;
  const drawRow = (
    cells: string[],
    options: {
      y: number;
      height: number;
      fill: string;
      color: string;
      font: string;
      size: number;
      colors?: string[];
    },
  ): void => {
    doc
      .rect(MARGIN, options.y, contentWidth(), options.height)
      .fill(options.fill);
    prefix = 0;
    for (const [index, cell] of cells.entries()) {
      const column = columns[index];
      if (column === undefined) continue;
      const x = MARGIN + prefix * contentWidth();
      const width = column.width * contentWidth();
      prefix += column.width;
      doc
        .fillColor(options.colors?.[index] ?? options.color)
        .font(options.font)
        .fontSize(options.size)
        .text(
          cell,
          x + 4,
          options.y + (options.height - options.size) / 2 - 1,
          {
            width: width - 8,
            align: column.align,
            ellipsis: true,
          },
        );
    }
  };

  drawRow(
    columns.map((column) => column.label),
    {
      y,
      height: headerHeight,
      fill: INK,
      color: '#ffffff',
      font: 'Helvetica-Bold',
      size: 7.5,
    },
  );
  y += headerHeight;

  for (const [index, group] of rows.entries()) {
    const before = comparisonByKey.get(group.key)?.amount;
    const changeInfo = changeCell(
      group.amount,
      hasComparison ? before : undefined,
    );
    const cells = hasComparison
      ? [
          group.key,
          money(group.amount, report.currency),
          percent(group.share),
          before === undefined ? '-' : money(before, report.currency),
          changeInfo.text,
        ]
      : [group.key, money(group.amount, report.currency), percent(group.share)];
    drawRow(cells, {
      y,
      height: rowHeight,
      fill: index % 2 === 0 ? '#ffffff' : ROW_ALT,
      color: INK,
      font: 'Helvetica',
      size: 8.5,
      ...(hasComparison
        ? { colors: [INK, INK, GREY, GREY, changeInfo.color] }
        : {}),
    });
    y += rowHeight;
  }

  const totalCells = hasComparison
    ? ['Total', money(report.total, report.currency), '100.0%', '', '']
    : ['Total', money(report.total, report.currency), '100.0%'];
  drawRow(totalCells, {
    y,
    height: totalRowHeight,
    fill: '#eef2ff',
    color: INK,
    font: 'Helvetica-Bold',
    size: 9,
  });
  y += totalRowHeight + 16;

  // --- comparison summary ---------------------------------------------
  if (comparison !== undefined) {
    sectionTitle('Comparison');
    const boxHeight2 = 66;
    ensure(boxHeight2 + 8);
    const ratio =
      comparison.total === 0
        ? undefined
        : (report.total - comparison.total) / comparison.total;
    const accent = ratio !== undefined && ratio < 0 ? GREEN : RED;

    doc.roundedRect(MARGIN, y, contentWidth(), boxHeight2, 3).fill(LIGHT);
    doc.rect(MARGIN, y, 4, boxHeight2).fill(accent);
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(
        `${rangeLabel(report)}  vs  ${rangeLabel(comparison)}`,
        MARGIN + 14,
        y + 10,
        { width: contentWidth() - 28 },
      );
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(
        `Total ${money(report.total, report.currency)} vs ${money(comparison.total, report.currency)}  ·  change ${signedMoney(report.total - comparison.total, report.currency)}`,
        MARGIN + 14,
        y + 26,
        { width: contentWidth() - 28, ellipsis: true },
      );
    doc
      .fillColor(accent)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(
        ratio === undefined
          ? 'No baseline to compare against'
          : `${percent(ratio)} ${ratio < 0 ? 'reduction' : 'increase'} versus the comparison period`,
        MARGIN + 14,
        y + 43,
        { width: contentWidth() - 28 },
      );
    y += boxHeight2 + 8;
  }

  if (report.records.length === 0) {
    sectionTitle('No usage recorded in this range');
  }

  // --- page footers ----------------------------------------------------
  const pageRange = doc.bufferedPageRange();
  for (
    let pageIndex = pageRange.start;
    pageIndex < pageRange.start + pageRange.count;
    pageIndex += 1
  ) {
    doc.switchToPage(pageIndex);
    doc
      .moveTo(MARGIN, doc.page.height - 30)
      .lineTo(doc.page.width - MARGIN, doc.page.height - 30)
      .lineWidth(0.5)
      .stroke(BORDER);
    doc
      .fillColor(GREY)
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        `cloudcost  ·  generated ${report.generatedAt.slice(0, 10)}  ·  page ${pageIndex + 1} of ${pageRange.count}`,
        MARGIN,
        doc.page.height - 24,
        { width: doc.page.width - 2 * MARGIN, align: 'center' },
      );
  }

  doc.end();
  return finished;
}

export class PdfExporter implements ReportExporter {
  readonly format = 'pdf' as const;
  readonly mimeType = 'application/pdf';
  readonly extension = 'pdf';

  async export(report: CostReport, context?: ExportContext): Promise<Buffer> {
    return renderPdf(report, context);
  }
}
