import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Printer, 
  Mail, 
  MessageSquare, 
  Check, 
  Copy, 
  ExternalLink, 
  FileText, 
  Send
} from 'lucide-react';
import type { Invoice, RawWorkshop } from '../../types';
import { InvoiceDocument } from './InvoiceDocument';
import { invoicePdfService } from '../../services/invoicePdfService';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  workshops?: RawWorkshop[];
  onStatusChange?: (invoice: Invoice, newStatus: Invoice['status']) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onClose,
  invoice,
  workshops = [],
  onStatusChange,
}) => {
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isShareSupported, setIsShareSupported] = useState(false);

  // Check if Web Share API with files is supported in the current browser
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
      try {
        const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
        setIsShareSupported(navigator.canShare({ files: [testFile] }));
      } catch (_) {
        setIsShareSupported(false);
      }
    }
  }, []);

  // Hydrate email dialog whenever invoice changes or modal opens
  useEffect(() => {
    if (!invoice) return;

    // Find workshop email if invoice email is empty
    const matchedWorkshop = workshops.find(
      w => w.raw_id === invoice.raw_id || w.name.toUpperCase() === invoice.customer_name.toUpperCase()
    );

    const email = invoice.customer_email || matchedWorkshop?.contact_email || '';
    setRecipientEmail(email);

    const subject = `Tax Invoice ${invoice.invoice_no} from Model Reports Online`;
    setEmailSubject(subject);

    const body = `Dear ${invoice.customer_name},\n\n` +
      `Please find attached your official Tax Invoice ${invoice.invoice_no} for vehicle compliance verification services.\n\n` +
      `--------------------------------------------------\n` +
      `INVOICE SUMMARY\n` +
      `--------------------------------------------------\n` +
      `Invoice #: ${invoice.invoice_no}\n` +
      `Amount Due: $${invoice.balance_due.toFixed(2)} AUD\n` +
      `Due Date: ${invoice.due_date}\n\n` +
      `--------------------------------------------------\n` +
      `EFT DIRECT DEPOSIT PAYMENT DETAILS\n` +
      `--------------------------------------------------\n` +
      `Bank: GSB ( Great Southern Bank )\n` +
      `Account Name: Sydney Vehicle Compliance\n` +
      `BSB: 814 282\n` +
      `Account Number: 51414735\n` +
      `Payment Reference: ${invoice.invoice_no}\n\n` +
      `Thank you for your business.\n\n` +
      `Kind regards,\n` +
      `Model Reports Online\n` +
      `Email: support@modelreportsonline.com.au\n` +
      `Phone: 0402 750 571\n` +
      `Website: modelreportsonline.com.au`;

    setEmailBody(body);
    setCopied(false);
  }, [invoice, workshops]);

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

  // Handles Email button: prepares PDF in memory (WITHOUT downloading to disk)
  // and launches native Mail app with PDF directly attached via Web Share API
  const handleEmailClick = async () => {
    try {
      setIsGeneratingPdf(true);
      // Generate PDF strictly in-memory (autoDownload = false, NEVER downloads to disk)
      const doc = invoicePdfService.generatePdf(invoice, false);
      const pdfBlob = doc.output('blob');
      const filename = `Invoice_${invoice.invoice_no}.pdf`;
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      // If browser supports Web Share with files (Safari on macOS / iOS / modern Chrome)
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: emailSubject,
          text: `To: ${recipientEmail || invoice.customer_name}\n\n${emailBody}`,
        });

        if (onStatusChange && invoice.status === 'draft') {
          onStatusChange(invoice, 'sent');
        }
        return;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User closed/dismissed native share sheet, show the dialog so they have other options
        setIsEmailModalOpen(true);
        return;
      }
      console.warn('Native share notice:', err);
    } finally {
      setIsGeneratingPdf(false);
    }

    // Fallback: If native share with files is not supported or encountered an issue,
    // open the Email Composer Dialog (WITHOUT downloading any file)
    setIsEmailModalOpen(true);
  };

  // Sends email with PDF file attachment via native macOS/iOS Web Share API if supported
  const handleNativeShareEmail = async () => {
    try {
      const doc = invoicePdfService.generatePdf(invoice, false);
      const pdfBlob = doc.output('blob');
      const filename = `Invoice_${invoice.invoice_no}.pdf`;
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: emailSubject,
          text: `To: ${recipientEmail || invoice.customer_name}\n\n${emailBody}`,
        });
        if (onStatusChange && invoice.status === 'draft') {
          onStatusChange(invoice, 'sent');
        }
        return;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Native share aborted or unsupported, falling back to default client:', err);
      }
    }

    // Fallback to mailto
    handleOpenMailto();
  };

  // Opens default mail client (Apple Mail, Outlook) via mailto
  const handleOpenMailto = () => {
    const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailto;
    if (onStatusChange && invoice.status === 'draft') {
      onStatusChange(invoice, 'sent');
    }
  };

  // Opens Gmail Web compose with addressing details pre-filled
  const handleOpenGmailWeb = () => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipientEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailUrl, '_blank');
    if (onStatusChange && invoice.status === 'draft') {
      onStatusChange(invoice, 'sent');
    }
  };

  const handleCopyEmailBody = () => {
    navigator.clipboard.writeText(emailBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0">
        <div className="bg-slate-100 rounded-xl shadow-2xl max-w-4xl w-full border border-slate-300 overflow-hidden my-2 sm:my-6 max-h-[96vh] flex flex-col print:shadow-none print:m-0 print:border-none print:max-h-none">
          {/* Modal Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 shrink-0 gap-2 print:hidden">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-slate-900">{invoice.invoice_no}</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase font-mono tracking-wide ${
                  invoice.status === 'paid'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : invoice.status === 'sent'
                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {invoice.status}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md shadow-2xs transition cursor-pointer"
                title="Print invoice"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-sky-700 hover:bg-sky-800 text-white rounded-md shadow-2xs transition cursor-pointer"
                title="Download official PDF document"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-2xs transition cursor-pointer"
                title="Send invoice details to workshop via WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleEmailClick}
                disabled={isGeneratingPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-md shadow-2xs transition cursor-pointer"
                title="Send invoice via email with attached PDF and addressing details"
              >
                <Mail className="w-3.5 h-3.5 text-sky-300" />
                <span>Email</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                title="Close Preview"
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

      {/* Dedicated Email Dispatch & PDF Attachment Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-300 overflow-hidden my-4 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-sky-500/20 text-sky-300 rounded-md">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Send Tax Invoice via Email</h3>
                  <p className="text-[11px] text-slate-300">
                    {invoice.invoice_no} • {invoice.customer_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-md transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Form Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* PDF In-Memory Direct Attachment Card */}
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-300 rounded-lg flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono font-bold text-emerald-950 truncate">
                        Invoice_{invoice.invoice_no}.pdf
                      </p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full border border-emerald-300">
                        <Check className="w-3 h-3 text-emerald-600" />
                        PDF Attached Directly
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Attached directly to email in memory (no disk download needed)
                    </p>
                  </div>
                </div>
              </div>

              {/* Addressing Details: Recipient Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient Email Address (To:)
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={e => setRecipientEmail(e.target.value)}
                    placeholder="e.g. workshop@example.com.au"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
                {!recipientEmail && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Please provide an email address for {invoice.customer_name}.
                  </p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              {/* Message Body */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Email Message Body (Pre-addressed)</span>
                  <button
                    type="button"
                    onClick={handleCopyEmailBody}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied to clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Message</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={8}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono leading-relaxed text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden resize-y"
                />
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-100 transition cursor-pointer"
              >
                Back to Preview
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {/* 1. If Web Share with files is supported (Safari / Mac), direct share with file */}
                {isShareSupported && (
                  <button
                    type="button"
                    onClick={handleNativeShareEmail}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold rounded-md shadow-2xs transition cursor-pointer"
                    title="Opens Mail App with PDF attached directly"
                  >
                    <Send className="w-3.5 h-3.5 text-sky-200" />
                    <span>Send via Mail App (PDF Attached)</span>
                  </button>
                )}

                {/* 2. Open in Gmail Web */}
                <button
                  type="button"
                  onClick={handleOpenGmailWeb}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer"
                  title="Open draft in Gmail web with addressing details"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-red-500" />
                  <span>Open in Gmail</span>
                </button>

                {/* 3. Open in Default Mail Client (Apple Mail, Outlook) */}
                <button
                  type="button"
                  onClick={handleOpenMailto}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer"
                  title="Open system default mail client"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Open Mail App</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
