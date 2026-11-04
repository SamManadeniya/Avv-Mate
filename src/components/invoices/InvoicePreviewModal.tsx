import React from 'react';
import { X, Download, Printer, Mail, MessageSquare } from 'lucide-react';
import type { Invoice } from '../../types';
import { InvoiceDocument } from './InvoiceDocument';
import { invoicePdfService } from '../../services/invoicePdfService';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onStatusChange?: (invoice: Invoice, newStatus: Invoice['status']) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onStatusChange,
}) => {
  if (!isOpen || !invoice) return null;

  const handleDownload = () => {
    invoicePdfService.generatePdf(invoice, true);
  };

  const handlePrint = () => {
    invoicePdfService.printInvoice(invoice);
  };

  const handleSendWhatsApp = () => {
    const text = `*TAX INVOICE — ${invoice.invoice_no}*\n` +
      `Hi *${invoice.customer_name}*,\n\n` +
      `Here is your invoice for AVV compliance verification:\n` +
      `📄 Invoice #: *${invoice.invoice_no}*\n` +
      `💰 Amount Due: *$${invoice.balance_due.toFixed(2)} AUD*\n` +
      `📅 Due Date: *${invoice.due_date}*\n\n` +
      `*Bank Details for Direct Deposit:*\n` +
      `Bank: GSB ( Great Southern Bank )\n` +
      `AC Name: Sydney Vehicle Compliance\n` +
      `BSB: 814 282\n` +
      `AC No: 51414735\n` +
      `Reference: *${invoice.invoice_no}*\n\n` +
      `Thank you!\n` +
      `*Model Reports Online / AVV Mate*`;

    const phone = (invoice.customer_phone || '').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone.startsWith('0') ? '61' + phone.slice(1) : phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    if (onStatusChange && invoice.status === 'draft') {
      onStatusChange(invoice, 'sent');
    }
  };

  const handleSendEmail = () => {
    const subject = `Tax Invoice ${invoice.invoice_no} from Model Reports Online`;
    const body = `Dear ${invoice.customer_name},\n\n` +
      `Please find attached your Tax Invoice ${invoice.invoice_no} for vehicle compliance verification services.\n\n` +
      `Invoice #: ${invoice.invoice_no}\n` +
      `Balance Due: $${invoice.balance_due.toFixed(2)} AUD\n` +
      `Due Date: ${invoice.due_date}\n\n` +
      `EFT Payment Details:\n` +
      `Bank: GSB ( Great Southern Bank )\n` +
      `Account Name: Sydney Vehicle Compliance\n` +
      `BSB: 814 282\n` +
      `Account Number: 51414735\n` +
      `Reference: ${invoice.invoice_no}\n\n` +
      `Kind regards,\nModel Reports Online\nsupport@modelreportsonline.com.au\n0402 750 571`;

    const mailto = `mailto:${encodeURIComponent(invoice.customer_email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    if (onStatusChange && invoice.status === 'draft') {
      onStatusChange(invoice, 'sent');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0">
      <div className="bg-slate-100 rounded-xl shadow-2xl max-w-4xl w-full border border-slate-300 overflow-hidden my-2 sm:my-6 max-h-[96vh] flex flex-col print:shadow-none print:m-0 print:border-none print:max-h-none">
        {/* Modal Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 shrink-0 gap-2 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-slate-900">{invoice.invoice_no}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase font-mono ${
                invoice.status === 'paid'
                  ? 'bg-emerald-100 text-emerald-800'
                  : invoice.status === 'sent'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {invoice.status}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md shadow-2xs transition cursor-pointer"
              title="Print invoice directly"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-sky-700 hover:bg-sky-800 text-white rounded-md shadow-2xs transition cursor-pointer"
              title="Download official PDF document"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-2xs transition cursor-pointer"
              title="Send invoice details to workshop via WhatsApp"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            <button
              onClick={handleSendEmail}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-md shadow-2xs transition cursor-pointer"
              title="Send via Email"
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Email</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Document Body */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-slate-200/60 flex justify-center">
          <InvoiceDocument invoice={invoice} />
        </div>
      </div>
    </div>
  );
};
