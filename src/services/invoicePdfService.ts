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
    const tealColor = [54, 84, 88]; // #365458 Dark Teal from user screenshot

    // 1. Top Banner (Dark Teal)
    doc.setFillColor(tealColor[0], tealColor[1], tealColor[2]);
    doc.rect(0, 0, pageWidth, 36, 'F');

    // Logo
    try {
      doc.addImage(MODEL_REPORTS_LOGO_BASE64, 'PNG', 12, 6, 24, 24);
    } catch (_) {}

    // TAX INVOICE title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('TAX INVOICE', pageWidth / 2, 22, { align: 'center' });

    // Company info on the right
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(DEFAULT_COMPANY_DETAILS.name, pageWidth - 14, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`ABN ${DEFAULT_COMPANY_DETAILS.abn}`, pageWidth - 14, 19, { align: 'right' });
    doc.text(DEFAULT_COMPANY_DETAILS.website, pageWidth - 14, 24, { align: 'right' });

    // 2. Sub-strip: BALANCE DUE
    doc.setFillColor(248, 250, 252); // #f8fafc
    doc.rect(0, 36, pageWidth, 11, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(0, 47, pageWidth, 47);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`BALANCE DUE  $${invoice.balance_due.toFixed(2)}`, pageWidth - 14, 43, { align: 'right' });

    // 3. Customer (Left) and Metadata (Right)
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.customer_name.toUpperCase(), 14, 58);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    if (invoice.customer_address) {
      const addressLines = invoice.customer_address.split('\n');
      let y = 63;
      addressLines.forEach(line => {
        doc.text(line.trim(), 14, y);
        y += 4.5;
      });
    } else {
      let y = 63;
      if (invoice.raw_id) {
        doc.text(`RAW ID: ${invoice.raw_id}`, 14, y);
        y += 4.5;
      }
      if (invoice.customer_email) {
        doc.text(invoice.customer_email, 14, y);
        y += 4.5;
      }
      if (invoice.customer_phone) {
        doc.text(invoice.customer_phone, 14, y);
        y += 4.5;
      }
      doc.text('Australia', 14, y);
    }

    // Right Metadata block
    const metaXLabel = 145;
    const metaXVal = pageWidth - 14;
    doc.setFontSize(8.5);

    const metaRows = [
      ['Invoice#', invoice.invoice_no, true],
      ['Invoice Date', invoice.invoice_date, false],
      ['Terms', invoice.terms || 'Due on Receipt', false],
      ['Due Date', invoice.due_date, false],
    ];

    let metaY = 58;
    metaRows.forEach(([label, val, isBold]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(String(label), metaXLabel, metaY);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(String(val), metaXVal, metaY, { align: 'right' });
      metaY += 5;
    });

    // 4. Line Items Table
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
      startY: 85,
      head: [['#', 'ITEM & DESCRIPTION', 'AMOUNT']],
      body: tableBody,
      theme: 'plain',
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
        1: { cellWidth: 135, textColor: [15, 23, 42], fontSize: 8.5 },
        2: { halign: 'right', cellWidth: 45, textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      },
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
        lineWidth: { bottom: 0.2 },
        lineColor: [241, 245, 249],
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 140;

    // 5. Bank Account & Totals Section
    const boxY = finalY + 6;
    doc.setFillColor(248, 250, 252); // #f8fafc
    doc.roundedRect(14, boxY, pageWidth - 28, 48, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, boxY, pageWidth - 28, 48, 2, 2, 'S');

    // Left: Bank details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('BANK ACCOUNT', 20, boxY + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Bank: ${DEFAULT_COMPANY_DETAILS.bankAccount.bank}`, 20, boxY + 14);
    doc.text(`AC Name: ${DEFAULT_COMPANY_DETAILS.bankAccount.acName}`, 20, boxY + 19);
    doc.setFont('helvetica', 'bold');
    doc.text(`BSB: ${DEFAULT_COMPANY_DETAILS.bankAccount.bsb}`, 20, boxY + 24);
    doc.text(`AC No: ${DEFAULT_COMPANY_DETAILS.bankAccount.acNo}`, 20, boxY + 29);
    doc.setFont('helvetica', 'normal');
    doc.text(`REF: ${invoice.invoice_no}`, 20, boxY + 34);

    // Right: Financial breakdown
    const totLabelX = 135;
    const totValX = pageWidth - 20;

    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Sub Total', totLabelX, boxY + 10);
    doc.text(`$${invoice.subtotal.toFixed(2)}`, totValX, boxY + 10, { align: 'right' });

    doc.text('Total Taxable Amount', totLabelX, boxY + 16);
    doc.text(`$${invoice.subtotal.toFixed(2)}`, totValX, boxY + 16, { align: 'right' });

    doc.text('GST (10%)', totLabelX, boxY + 22);
    doc.text(`$${invoice.tax_amount.toFixed(2)}`, totValX, boxY + 22, { align: 'right' });

    doc.setDrawColor(203, 213, 225);
    doc.line(totLabelX, boxY + 26, totValX, boxY + 26);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Total', totLabelX, boxY + 31);
    doc.text(`$${invoice.total_amount.toFixed(2)}`, totValX, boxY + 31, { align: 'right' });

    doc.line(totLabelX, boxY + 34, totValX, boxY + 34);
    doc.setFontSize(10);
    doc.text('Balance Due', totLabelX, boxY + 41);
    doc.text(`$${invoice.balance_due.toFixed(2)}`, totValX, boxY + 41, { align: 'right' });

    // 6. Bottom Banner (Dark Teal)
    doc.setFillColor(tealColor[0], tealColor[1], tealColor[2]);
    doc.rect(0, pageHeight - 16, pageWidth, 16, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Email - ${DEFAULT_COMPANY_DETAILS.email}`, 14, pageHeight - 8);
    doc.text(`Phone - ${DEFAULT_COMPANY_DETAILS.phone}`, pageWidth - 14, pageHeight - 8, { align: 'right' });

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
