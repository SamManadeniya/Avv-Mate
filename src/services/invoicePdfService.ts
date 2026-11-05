import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice } from '../types';
import { DEFAULT_COMPANY_DETAILS } from '../data/invoiceConstants';
import { MODEL_REPORTS_LOGO_BASE64 } from '../assets/logoBase64';

export const invoicePdfService = {
  /**
   * Generates a pixel-perfect, vector Australian Tax Invoice PDF
   * matching the Model Reports Online brand styling.
   */
  generatePdf(invoice: Invoice, autoDownload = true): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 14;
    const contentWidth = pageWidth - 2 * margin; // 182mm
    const rightEdge = pageWidth - margin; // 196mm
    const tealColor = [54, 84, 88]; // #365458 Dark Teal

    const formatDateDisplay = (dateStr: string) => {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (_) {
        return dateStr;
      }
    };

    // 1. Top Banner (Dark Teal)
    doc.setFillColor(tealColor[0], tealColor[1], tealColor[2]);
    doc.rect(0, 0, pageWidth, 36, 'F');

    // Logo
    try {
      doc.addImage(MODEL_REPORTS_LOGO_BASE64, 'PNG', margin, 6, 24, 24);
    } catch (_) {}

    // TAX INVOICE title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('TAX INVOICE', pageWidth / 2, 22, { align: 'center' });

    // Company info on the right
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(DEFAULT_COMPANY_DETAILS.name, rightEdge, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`ABN ${DEFAULT_COMPANY_DETAILS.abn}`, rightEdge, 19, { align: 'right' });
    doc.text(DEFAULT_COMPANY_DETAILS.website, rightEdge, 24, { align: 'right' });

    // 2. Sub-strip: BALANCE DUE
    doc.setFillColor(248, 250, 252); // #f8fafc
    doc.rect(0, 36, pageWidth, 11, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(0, 47, pageWidth, 47);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`BALANCE DUE  $${invoice.balance_due.toFixed(2)}`, rightEdge, 43, { align: 'right' });

    // 3. Customer (Left) and Metadata (Right)
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.customer_name.toUpperCase(), margin, 58);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    if (invoice.customer_address) {
      const addressLines = invoice.customer_address.split('\n');
      let y = 63.5;
      addressLines.forEach(line => {
        doc.text(line.trim(), margin, y);
        y += 4.5;
      });
    } else {
      let y = 63.5;
      if (invoice.raw_id) {
        doc.text(`RAW ID: ${invoice.raw_id}`, margin, y);
        y += 4.5;
      }
      if (invoice.customer_email) {
        doc.text(invoice.customer_email, margin, y);
        y += 4.5;
      }
      if (invoice.customer_phone) {
        doc.text(invoice.customer_phone, margin, y);
        y += 4.5;
      }
      doc.text('Australia', margin, y);
    }

    // Right Metadata block (58mm width, right-aligned to rightEdge)
    const metaXLabel = rightEdge - 58;
    const metaXVal = rightEdge;
    doc.setFontSize(8.5);

    const metaRows: [string, string, boolean][] = [
      ['Invoice#', invoice.invoice_no, true],
      ['Invoice Date', formatDateDisplay(invoice.invoice_date), false],
      ['Terms', invoice.terms || 'Due on Receipt', false],
      ['Due Date', formatDateDisplay(invoice.due_date), false],
    ];

    let metaY = 58;
    metaRows.forEach(([label, val, isBold]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, metaXLabel, metaY);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(val, metaXVal, metaY, { align: 'right' });
      metaY += 5.2;
    });

    // 4. Line Items Table (Exact 182mm content width: 12 + 130 + 40)
    const tableBody = invoice.items.map((it, idx) => {
      const desc = it.item_details;
      const rateStr = `${it.quantity.toFixed(2)} ${it.unit || 'pcs'} x ${it.rate.toFixed(2)}`;
      return [
        String(idx + 1),
        desc,
        `$${it.amount.toFixed(2)}\n${rateStr}`
      ];
    });

    autoTable(doc, {
      startY: 84,
      head: [['#', 'ITEM & DESCRIPTION', 'AMOUNT']],
      body: tableBody,
      theme: 'plain',
      tableWidth: contentWidth,
      margin: { left: margin, right: margin },
      headStyles: {
        textColor: [100, 116, 139],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'left',
        lineWidth: { bottom: 0.5 },
        lineColor: [203, 213, 225],
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12, textColor: [100, 116, 139], fontStyle: 'bold' },
        1: { cellWidth: 130, textColor: [15, 23, 42], fontSize: 8.5 },
        2: { halign: 'right', cellWidth: 40, textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      },
      didParseCell: (data) => {
        if (data.column.index === 2) {
          data.cell.styles.halign = 'right';
        }
      },
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
        lineWidth: { bottom: 0.2 },
        lineColor: [241, 245, 249],
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 135;

    // 5. Bank Account & Totals Section (Balanced card matching HTML preview)
    const boxY = finalY + 8;
    const boxHeight = 56;
    doc.setFillColor(248, 250, 252); // #f8fafc
    doc.roundedRect(margin, boxY, contentWidth, boxHeight, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240); // #e2e8f0
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, boxY, contentWidth, boxHeight, 3, 3, 'S');

    // Left: Bank details
    const bankX = margin + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('BANK ACCOUNT', bankX, boxY + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Bank: ${DEFAULT_COMPANY_DETAILS.bankAccount.bank}`, bankX, boxY + 16);
    doc.text(`AC Name: ${DEFAULT_COMPANY_DETAILS.bankAccount.acName}`, bankX, boxY + 22);
    doc.setFont('helvetica', 'bold');
    doc.text(`BSB: ${DEFAULT_COMPANY_DETAILS.bankAccount.bsb}`, bankX, boxY + 28);
    doc.text(`AC No: ${DEFAULT_COMPANY_DETAILS.bankAccount.acNo}`, bankX, boxY + 34);
    doc.setFont('helvetica', 'normal');
    doc.text(`REF: ${invoice.invoice_no}`, bankX, boxY + 40);

    // Right: Financial breakdown (Symmetric 6mm padding from card's right boundary)
    const totValX = rightEdge - 6;
    const totLabelX = rightEdge - 66; // 60mm column width

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    // Sub Total
    doc.text('Sub Total', totLabelX, boxY + 9);
    doc.text(invoice.subtotal.toFixed(2), totValX, boxY + 9, { align: 'right' });

    // Total Taxable Amount
    doc.text('Total Taxable Amount', totLabelX, boxY + 16);
    doc.text(invoice.subtotal.toFixed(2), totValX, boxY + 16, { align: 'right' });

    // GST (10%)
    doc.text('GST (10%)', totLabelX, boxY + 23);
    doc.text(invoice.tax_amount.toFixed(2), totValX, boxY + 23, { align: 'right' });

    // Divider line above Total
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(totLabelX, boxY + 27, totValX, boxY + 27);

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Total', totLabelX, boxY + 33);
    doc.text(`$${invoice.total_amount.toFixed(2)}`, totValX, boxY + 33, { align: 'right' });

    // Divider line above Balance Due
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.5);
    doc.line(totLabelX, boxY + 38, totValX, boxY + 38);

    // Balance Due
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Balance Due', totLabelX, boxY + 46);
    doc.text(`$${invoice.balance_due.toFixed(2)}`, totValX, boxY + 46, { align: 'right' });

    // 6. Bottom Banner (Dark Teal)
    doc.setFillColor(tealColor[0], tealColor[1], tealColor[2]);
    doc.rect(0, pageHeight - 16, pageWidth, 16, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Email - ${DEFAULT_COMPANY_DETAILS.email}`, margin, pageHeight - 8);
    doc.text(`Phone - ${DEFAULT_COMPANY_DETAILS.phone}`, rightEdge, pageHeight - 8, { align: 'right' });

    if (autoDownload) {
      doc.save(`Invoice_${invoice.invoice_no}.pdf`);
    }

    return doc;
  },

  /**
   * Triggers native high-fidelity browser print
   */
  printInvoice(invoice: Invoice) {
    const doc = this.generatePdf(invoice, false);
    const blobUrl = doc.output('bloburl');
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl.toString();
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
  }
};
