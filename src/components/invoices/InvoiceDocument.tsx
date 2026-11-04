import React from 'react';
import type { Invoice } from '../../types';
import { MODEL_REPORTS_LOGO_BASE64 } from '../../assets/logoBase64';
import { DEFAULT_COMPANY_DETAILS } from '../../data/invoiceConstants';

interface InvoiceDocumentProps {
  invoice: Invoice;
}

export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({ invoice }) => {
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

  return (
    <div
      id="invoice-printable-document"
      className="bg-white text-slate-800 font-sans shadow-lg mx-auto overflow-hidden print:shadow-none print:m-0"
      style={{ width: '100%', maxWidth: '800px', minHeight: '1050px', display: 'flex', flexDirection: 'column' }}
    >
      {/* 1. Header Banner (Dark Teal) */}
      <div
        className="px-8 py-6 flex items-center justify-between text-white"
        style={{ backgroundColor: '#365458' }}
      >
        {/* Left: Logo */}
        <div className="flex items-center gap-4">
          <img
            src={MODEL_REPORTS_LOGO_BASE64}
            alt="Model Reports Online Logo"
            className="w-16 h-16 rounded-full object-contain bg-white/10 p-1"
          />
        </div>

        {/* Center: Title */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-widest uppercase">
            TAX INVOICE
          </h1>
        </div>

        {/* Right: Company details */}
        <div className="text-right text-xs leading-relaxed space-y-0.5">
          <p className="font-bold text-sm tracking-wide">{DEFAULT_COMPANY_DETAILS.name}</p>
          <p className="text-slate-200">ABN {DEFAULT_COMPANY_DETAILS.abn}</p>
          <p className="text-slate-200">{DEFAULT_COMPANY_DETAILS.website}</p>
        </div>
      </div>

      {/* 2. Balance Due Strip */}
      <div className="bg-slate-50 border-b border-slate-200 px-8 py-2.5 flex justify-end">
        <p className="text-xs sm:text-sm font-bold text-slate-800 tracking-wide">
          BALANCE DUE <span className="text-base sm:text-lg">${invoice.balance_due.toFixed(2)}</span>
        </p>
      </div>

      {/* 3. Customer & Invoice Meta Details */}
      <div className="px-8 pt-8 pb-6 grid grid-cols-2 gap-8 text-xs">
        {/* Left: Customer */}
        <div className="space-y-1">
          <p className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
            {invoice.customer_name}
          </p>
          {invoice.customer_address ? (
            <p className="text-slate-600 whitespace-pre-line leading-relaxed">
              {invoice.customer_address}
            </p>
          ) : (
            <div className="text-slate-500 space-y-0.5">
              {invoice.raw_id && <p className="font-mono font-semibold">RAW ID: {invoice.raw_id}</p>}
              {invoice.customer_email && <p>{invoice.customer_email}</p>}
              {invoice.customer_phone && <p>{invoice.customer_phone}</p>}
              <p>Australia</p>
            </div>
          )}
        </div>

        {/* Right: Metadata */}
        <div className="flex justify-end">
          <table className="text-xs border-collapse">
            <tbody>
              <tr>
                <td className="py-1 pr-6 font-semibold text-slate-500 text-right">Invoice#</td>
                <td className="py-1 font-mono font-bold text-slate-900 text-right">{invoice.invoice_no}</td>
              </tr>
              <tr>
                <td className="py-1 pr-6 font-semibold text-slate-500 text-right">Invoice Date</td>
                <td className="py-1 font-medium text-slate-800 text-right">{formatDateDisplay(invoice.invoice_date)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-6 font-semibold text-slate-500 text-right">Terms</td>
                <td className="py-1 font-medium text-slate-800 text-right">{invoice.terms || 'Due on Receipt'}</td>
              </tr>
              <tr>
                <td className="py-1 pr-6 font-semibold text-slate-500 text-right">Due Date</td>
                <td className="py-1 font-medium text-slate-800 text-right">{formatDateDisplay(invoice.due_date)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Line Items Table */}
      <div className="px-8 flex-1">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 uppercase tracking-wider text-slate-500 text-[11px] font-bold">
              <th className="py-2.5 px-2 w-12 text-center">#</th>
              <th className="py-2.5 px-4">ITEM & DESCRIPTION</th>
              <th className="py-2.5 px-4 text-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.items.map((item, idx) => (
              <tr key={item.id || idx}>
                <td className="py-4 px-2 text-center font-mono font-semibold text-slate-600 align-top">
                  {idx + 1}
                </td>
                <td className="py-4 px-4 align-top">
                  <p className="font-bold text-slate-900 text-xs sm:text-sm whitespace-pre-line">
                    {item.item_details.split('\n')[0]}
                  </p>
                  {item.item_details.split('\n').length > 1 && (
                    <div className="mt-1 font-mono text-[11px] text-slate-500 space-y-0.5 whitespace-pre-line leading-relaxed">
                      {item.item_details.split('\n').slice(1).join('\n')}
                    </div>
                  )}
                </td>
                <td className="py-4 px-4 text-right align-top">
                  <p className="font-bold text-slate-900 text-xs sm:text-sm">
                    ${item.amount.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {item.quantity.toFixed(2)} {item.unit || 'pcs'} x {item.rate.toFixed(2)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5. Bank Account & Totals Section */}
      <div className="px-8 py-6">
        <div className="bg-slate-50/80 rounded-lg p-5 border border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Left: Bank Account */}
          <div className="space-y-1 text-slate-700">
            <p className="font-bold uppercase tracking-wider text-slate-900 text-[11px]">
              BANK ACCOUNT
            </p>
            <p className="font-medium text-slate-800">Bank: {DEFAULT_COMPANY_DETAILS.bankAccount.bank}</p>
            <p className="font-medium text-slate-800">AC Name: {DEFAULT_COMPANY_DETAILS.bankAccount.acName}</p>
            <p className="font-mono font-semibold text-slate-900">BSB: {DEFAULT_COMPANY_DETAILS.bankAccount.bsb}</p>
            <p className="font-mono font-semibold text-slate-900">AC No: {DEFAULT_COMPANY_DETAILS.bankAccount.acNo}</p>
            <p className="font-medium text-slate-700">REF: {invoice.invoice_no}</p>
          </div>

          {/* Right: Financial Totals */}
          <div className="space-y-1.5 flex flex-col justify-center">
            <div className="flex justify-between text-slate-600">
              <span>Sub Total</span>
              <span className="font-mono font-semibold">${invoice.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Taxable Amount</span>
              <span className="font-mono font-semibold">${invoice.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST (10%)</span>
              <span className="font-mono font-semibold">${invoice.tax_amount.toFixed(2)}</span>
            </div>
            <div className="border-t border-slate-300 pt-1.5 flex justify-between font-bold text-slate-900 text-sm">
              <span>Total</span>
              <span className="font-mono">${invoice.total_amount.toFixed(2)}</span>
            </div>
            <div className="border-t-2 border-slate-400 pt-1.5 flex justify-between font-extrabold text-slate-900 text-sm sm:text-base">
              <span>Balance Due</span>
              <span className="font-mono">${invoice.balance_due.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Footer Banner (Dark Teal) */}
      <div
        className="px-8 py-4 text-white text-xs flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto"
        style={{ backgroundColor: '#365458' }}
      >
        <p className="font-medium tracking-wide">
          Email - {DEFAULT_COMPANY_DETAILS.email}
        </p>
        <p className="font-medium tracking-wide">
          Phone - {DEFAULT_COMPANY_DETAILS.phone}
        </p>
      </div>
    </div>
  );
};

