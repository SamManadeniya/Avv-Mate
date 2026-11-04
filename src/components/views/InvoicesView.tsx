import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Download, 
  Eye, 
  Edit2, 
  Trash2 
} from 'lucide-react';
import type { Invoice } from '../../types';
import { exportService } from '../../services/exportService';

interface InvoicesViewProps {
  invoices: Invoice[];
  onNewInvoice: () => void;
  onEditInvoice: (invoice: Invoice) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (invoice: Invoice) => void;
  onStatusChange: (invoice: Invoice, newStatus: Invoice['status']) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  invoices,
  onNewInvoice,
  onEditInvoice,
  onPreviewInvoice,
  onDeleteInvoice,
  onStatusChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchSearch =
        inv.invoice_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.vin && inv.vin.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (inv.raw_id && inv.raw_id.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  // Aggregate statistics
  const totalInvoiced = invoices.reduce((acc, inv) => acc + (inv.total_amount || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((acc, inv) => acc + (inv.total_amount || 0), 0);
  const totalBalanceDue = invoices.filter(i => i.status !== 'paid').reduce((acc, inv) => acc + (inv.balance_due || 0), 0);

  const handleExportCsv = () => {
    const exportData = filteredInvoices.map(inv => ({
      'Invoice #': inv.invoice_no,
      'Customer Name': inv.customer_name,
      'RAW ID': inv.raw_id || '',
      'VIN': inv.vin || '',
      'Invoice Date': inv.invoice_date,
      'Due Date': inv.due_date,
      'Terms': inv.terms,
      'Subtotal': inv.subtotal.toFixed(2),
      'GST (10%)': inv.tax_amount.toFixed(2),
      'Total Amount': inv.total_amount.toFixed(2),
      'Balance Due': inv.balance_due.toFixed(2),
      'Status': inv.status.toUpperCase(),
    }));
    exportService.exportToCsv('avv_mate_invoices', exportData);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Financial Stats Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Invoiced</p>
          <p className="text-lg sm:text-2xl font-extrabold text-slate-900 font-mono mt-1">
            ${totalInvoiced.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{invoices.length} invoices generated</p>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Paid Invoices</p>
          <p className="text-lg sm:text-2xl font-extrabold text-emerald-700 font-mono mt-1">
            ${totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-emerald-600 mt-0.5">{invoices.filter(i => i.status === 'paid').length} cleared</p>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-amber-200 shadow-2xs bg-amber-50/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Outstanding Balance</p>
          <p className="text-lg sm:text-2xl font-extrabold text-amber-700 font-mono mt-1">
            ${totalBalanceDue.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-amber-600 mt-0.5">{invoices.filter(i => i.status !== 'paid').length} awaiting payment</p>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-sky-200 shadow-2xs bg-sky-50/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800">Standard Verification Fee</p>
          <p className="text-lg sm:text-2xl font-extrabold text-sky-800 font-mono mt-1">
            $330.00 <span className="text-xs text-sky-600 font-sans font-normal">inc. GST</span>
          </p>
          <p className="text-[10px] text-sky-600 mt-0.5">AVV & RAV Entry standard rate</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        {/* Header & Controls Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 tracking-tight">
                INVOICES & COMPLIANCE BILLING
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 font-mono font-semibold text-slate-700">
                {filteredInvoices.length} {filteredInvoices.length === 1 ? 'Invoice' : 'Invoices'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate, print, and track Australian Tax Invoices for RAW workshops and vehicle verifications
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCsv}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onNewInvoice}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Invoice</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-3 sm:p-3.5 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between text-xs">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by Invoice #, Customer, VIN, or RAW ID..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">🟡 Draft</option>
              <option value="sent">🔵 Sent</option>
              <option value="paid">🟢 Paid</option>
              <option value="overdue">🔴 Overdue</option>
            </select>
          </div>
        </div>

        {/* Mobile swipe helper */}
        <div className="md:hidden px-4 py-1.5 bg-sky-50/70 border-b border-sky-100 text-[11px] text-sky-800 flex items-center justify-between font-medium">
          <span>👉 Swipe table to view details & amounts</span>
          <span className="font-semibold text-sky-900 bg-sky-100 px-1.5 py-0.5 rounded text-[10px]">Actions pinned</span>
        </div>

        {/* Invoices Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 font-display uppercase tracking-wider text-slate-600 text-[11px]">
                <th className="py-2.5 px-3 sm:px-4 font-bold bg-sky-50/70">Invoice #</th>
                <th className="py-2.5 px-3 sm:px-4 font-bold">Customer Name</th>
                <th className="py-2.5 px-3 sm:px-4 font-bold">Vehicle Details</th>
                <th className="py-2.5 px-3 sm:px-4 font-bold">Date</th>
                <th className="py-2.5 px-3 sm:px-4 font-bold">Due Date</th>
                <th className="py-2.5 px-3 sm:px-4 font-bold text-right">Amount (AUD)</th>
                <th className="py-2.5 px-3 sm:px-4 font-bold text-center">Status</th>
                <th className="py-2.5 px-3 sm:px-4 font-bold text-right sticky right-0 bg-slate-100 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-sm">No invoices found</p>
                    <p className="text-xs mt-1">Click "New Invoice" or open a compliance job to generate one.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(invoice => {
                  const firstItem = invoice.items[0]?.item_details || '';
                  const itemSummary = firstItem.split('\n')[0] || 'Verification Services';

                  return (
                    <tr
                      key={invoice.id}
                      className="hover:bg-sky-50/40 transition group cursor-pointer"
                      onClick={() => onPreviewInvoice(invoice)}
                    >
                      {/* Invoice # */}
                      <td className="py-3 px-3 sm:px-4 font-mono font-bold text-slate-900 group-hover:text-sky-800 whitespace-nowrap bg-sky-50/30">
                        {invoice.invoice_no}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{invoice.customer_name}</div>
                        {invoice.raw_id && (
                          <div className="text-[10px] font-mono text-slate-500">{invoice.raw_id}</div>
                        )}
                      </td>

                      {/* Vehicle / Line Item */}
                      <td className="py-3 px-3 sm:px-4 max-w-xs truncate">
                        <div className="font-medium text-slate-800 truncate" title={itemSummary}>
                          {itemSummary}
                        </div>
                        {invoice.vin && (
                          <div className="text-[10px] font-mono text-slate-500">VIN: {invoice.vin}</div>
                        )}
                      </td>

                      {/* Invoice Date */}
                      <td className="py-3 px-3 sm:px-4 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(invoice.invoice_date)}
                      </td>

                      {/* Due Date */}
                      <td className="py-3 px-3 sm:px-4 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(invoice.due_date)}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          ${invoice.total_amount.toFixed(2)}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono">inc. GST</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 sm:px-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <select
                          value={invoice.status}
                          onChange={e => onStatusChange(invoice, e.target.value as any)}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase font-mono border cursor-pointer ${
                            invoice.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : invoice.status === 'sent'
                              ? 'bg-sky-100 text-sky-800 border-sky-300'
                              : invoice.status === 'overdue'
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}
                        >
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3 px-3 sm:px-4 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-sky-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onPreviewInvoice(invoice)}
                            className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-100 rounded transition"
                            title="Preview / Print / PDF"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditInvoice(invoice)}
                            className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-100 rounded transition"
                            title="Edit Invoice"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteInvoice(invoice)}
                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-100 rounded transition"
                            title="Delete Invoice"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
