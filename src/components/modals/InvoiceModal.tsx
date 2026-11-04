import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  FileText, 
  Plus, 
  Trash2, 
  Search, 
  Car, 
  Send, 
  AlertCircle,
  ChevronDown,
  Layers,
  Check
} from 'lucide-react';
import type { Invoice, InvoiceItem, RawWorkshop, ComplianceJob, ModelReport } from '../../types';
import { PRESET_INVOICE_SERVICES, DEFAULT_COMPANY_DETAILS } from '../../data/invoiceConstants';
import { DEFAULT_MODEL_REPORTS } from '../../data/seedData';
import { invoiceService } from '../../services/invoiceService';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (invoice: Invoice, andPreview?: boolean) => void | Promise<void>;
  invoiceToEdit?: Invoice | null;
  workshops: RawWorkshop[];
  jobs?: ComplianceJob[];
  modelReports?: ModelReport[];
  initialJob?: ComplianceJob | null;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  invoiceToEdit,
  workshops,
  jobs = [],
  modelReports = [],
  initialJob,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [rawId, setRawId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [terms, setTerms] = useState('Due on Receipt');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vin, setVin] = useState('');
  const [folderNo, setFolderNo] = useState('');

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [customerNotes, setCustomerNotes] = useState(DEFAULT_COMPANY_DETAILS.defaultNotes);
  const [status, setStatus] = useState<Invoice['status']>('draft');

  // Model Reports & Item Picker State (Zoho Invoice Style)
  const availableReports = useMemo(() => {
    return (modelReports && modelReports.length > 0) ? modelReports : DEFAULT_MODEL_REPORTS;
  }, [modelReports]);

  const [activeItemPickerIndex, setActiveItemPickerIndex] = useState<number | null>(null);
  const [itemPickerSearch, setItemPickerSearch] = useState('');
  const [itemPickerCategory, setItemPickerCategory] = useState<'all' | 'mre' | 'services'>('all');

  // Bulk Item Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkSelectedMres, setBulkSelectedMres] = useState<string[]>([]);
  const [bulkSelectedServices, setBulkSelectedServices] = useState<string[]>([]);
  const [bulkSearch, setBulkSearch] = useState('');

  const getModelReportRate = (mre: ModelReport): number => {
    const mreNo = (mre.mre_no || '').toUpperCase();
    const model = (mre.model || '').toLowerCase();
    if (mreNo.includes('000038') || model.includes('hiace')) return 660.00;
    if (mreNo.includes('000618') || model.includes('odyssey')) return 200.00;
    return 300.00;
  };

  const filteredMreList = useMemo(() => {
    const q = itemPickerSearch.toLowerCase().trim();
    if (!q) return availableReports;
    return availableReports.filter(r =>
      r.mre_no.toLowerCase().includes(q) ||
      (r.make && r.make.toLowerCase().includes(q)) ||
      (r.model && r.model.toLowerCase().includes(q)) ||
      (r.author && r.author.toLowerCase().includes(q)) ||
      (r.sev_no && r.sev_no.toLowerCase().includes(q))
    );
  }, [availableReports, itemPickerSearch]);

  const filteredServicesList = useMemo(() => {
    const q = itemPickerSearch.toLowerCase().trim();
    if (!q) return PRESET_INVOICE_SERVICES;
    return PRESET_INVOICE_SERVICES.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  }, [itemPickerSearch]);

  // Customer dropdown search
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Selected job for quick import
  const [selectedJobId, setSelectedJobId] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (invoiceToEdit) {
      setCustomerName(invoiceToEdit.customer_name);
      setCustomerAddress(invoiceToEdit.customer_address || '');
      setCustomerEmail(invoiceToEdit.customer_email || '');
      setCustomerPhone(invoiceToEdit.customer_phone || '');
      setRawId(invoiceToEdit.raw_id || '');
      setInvoiceNo(invoiceToEdit.invoice_no);
      setInvoiceDate(invoiceToEdit.invoice_date);
      setTerms(invoiceToEdit.terms || 'Due on Receipt');
      setDueDate(invoiceToEdit.due_date);
      setVin(invoiceToEdit.vin || '');
      setFolderNo(invoiceToEdit.folder_no || '');
      setItems(invoiceToEdit.items || []);
      setCustomerNotes(invoiceToEdit.customer_notes || DEFAULT_COMPANY_DETAILS.defaultNotes);
      setStatus(invoiceToEdit.status);
    } else {
      const targetJob = initialJob;
      const matchedWorkshop = targetJob ? workshops.find(w => w.raw_id === targetJob.raw_id || w.name === targetJob.raw_workshop_name) : null;

      const wsRawId = matchedWorkshop?.raw_id || targetJob?.raw_id || '';
      const generatedNo = invoiceService.generateNextInvoiceNo(wsRawId);

      setCustomerName(matchedWorkshop?.name || targetJob?.raw_workshop_name || '');
      setCustomerAddress(matchedWorkshop?.contact_email ? `RAW ID: ${wsRawId}\nEmail: ${matchedWorkshop.contact_email}\nAustralia` : '');
      setCustomerEmail(matchedWorkshop?.contact_email || '');
      setCustomerPhone(matchedWorkshop?.contact_phone || '');
      setRawId(wsRawId);
      setInvoiceNo(generatedNo);
      setInvoiceDate(new Date().toISOString().slice(0, 10));
      setTerms('Due on Receipt');
      setDueDate(new Date().toISOString().slice(0, 10));
      setVin(targetJob?.vin || '');
      setFolderNo(targetJob?.folder_no || '');
      setStatus('draft');
      setCustomerNotes(DEFAULT_COMPANY_DETAILS.defaultNotes);

      if (targetJob) {
        // Prefill default 2 items as in user's example invoice:
        // Item 1: Model report vehicle line item
        // Item 2: AVV & RAV Entry line item
        const vehicleLine = `${targetJob.mre_no || 'MRE-VERIFY'} : ${targetJob.make || 'Toyota'} ${targetJob.model || 'RAV4'}\nVIN : ${targetJob.vin}\nRAW ID : ${wsRawId || 'RAW-000XXX'}`;
        const entryLine = `AVV & RAV Entry\nVIN : ${targetJob.vin}`;

        setItems([
          {
            id: 'item_1',
            item_details: vehicleLine,
            quantity: 1,
            unit: 'pcs',
            rate: 200.00,
            tax_rate: 0.10,
            tax_name: 'GST [10%]',
            amount: 200.00,
          },
          {
            id: 'item_2',
            item_details: entryLine,
            quantity: 1,
            unit: 'pcs',
            rate: 300.00,
            tax_rate: 0.10,
            tax_name: 'GST [10%]',
            amount: 300.00,
          },
        ]);
      } else {
        // Default blank invoice row
        setItems([
          {
            id: `item_${Date.now()}`,
            item_details: 'AVV & RAV Entry',
            quantity: 1,
            unit: 'pcs',
            rate: 300.00,
            tax_rate: 0.10,
            tax_name: 'GST [10%]',
            amount: 300.00,
          },
        ]);
      }
    }

    setErrorMessage('');
    setIsCustomerDropdownOpen(false);
  }, [isOpen, invoiceToEdit, initialJob, workshops]);

  // Recalculate totals
  const subtotal = items.reduce((acc, it) => acc + (it.amount || 0), 0);
  const taxAmount = items.reduce((acc, it) => acc + ((it.amount || 0) * (it.tax_rate || 0)), 0);
  const totalAmount = subtotal + taxAmount;
  const balanceDue = totalAmount;

  const handleSelectWorkshop = (ws: RawWorkshop) => {
    setCustomerName(ws.name);
    setRawId(ws.raw_id);
    setCustomerEmail(ws.contact_email || '');
    setCustomerPhone(ws.contact_phone || '');
    setCustomerAddress(`RAW ID: ${ws.raw_id}\n${ws.contact_email ? `Email: ${ws.contact_email}\n` : ''}${ws.contact_phone ? `Phone: ${ws.contact_phone}\n` : ''}Australia`);
    setIsCustomerDropdownOpen(false);

    if (!invoiceToEdit) {
      setInvoiceNo(invoiceService.generateNextInvoiceNo(ws.raw_id));
    }
  };

  const handlePopulateFromJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    setVin(job.vin);
    setFolderNo(job.folder_no);
    if (!customerName) {
      setCustomerName(job.raw_workshop_name || job.raw_id || '');
    }
    if (!rawId && job.raw_id) {
      setRawId(job.raw_id);
    }

    const vehicleLine = `${job.mre_no || 'MRE'} : ${job.make || ''} ${job.model || ''}\nVIN : ${job.vin}\nRAW ID : ${job.raw_id || rawId || 'RAW-000XXX'}`;
    const entryLine = `AVV & RAV Entry\nVIN : ${job.vin}`;

    setItems([
      {
        id: `item_${Date.now()}_1`,
        item_details: vehicleLine,
        quantity: 1,
        unit: 'pcs',
        rate: 200.00,
        tax_rate: 0.10,
        tax_name: 'GST [10%]',
        amount: 200.00,
      },
      {
        id: `item_${Date.now()}_2`,
        item_details: entryLine,
        quantity: 1,
        unit: 'pcs',
        rate: 300.00,
        tax_rate: 0.10,
        tax_name: 'GST [10%]',
        amount: 300.00,
      },
    ]);
  };

  const handleAddItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        item_details: '',
        quantity: 1,
        unit: 'pcs',
        rate: 0.00,
        tax_rate: 0.10,
        tax_name: 'GST [10%]',
        amount: 0.00,
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      setItems([{
        id: `item_${Date.now()}`,
        item_details: '',
        quantity: 1,
        unit: 'pcs',
        rate: 0.00,
        tax_rate: 0.10,
        tax_name: 'GST [10%]',
        amount: 0.00,
      }]);
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const cur = { ...updated[index] };

      if (field === 'quantity') {
        cur.quantity = Number(value) || 0;
        cur.amount = cur.quantity * cur.rate;
      } else if (field === 'rate') {
        cur.rate = Number(value) || 0;
        cur.amount = cur.quantity * cur.rate;
      } else if (field === 'tax_rate') {
        cur.tax_rate = Number(value);
        cur.tax_name = Number(value) > 0 ? 'GST [10%]' : 'None [0%]';
      } else {
        (cur as any)[field] = value;
      }

      updated[index] = cur;
      return updated;
    });
  };

  const handleSelectModelReport = (index: number, mre: ModelReport) => {
    const rate = getModelReportRate(mre);
    const authorTag = mre.author ? ` (${mre.author})` : '';
    const details = `${mre.mre_no} : ${mre.make} ${mre.model}${authorTag}\nVIN : ${vin || 'XXXXXXXXXXXXXXXXX'}\nRAW ID : ${rawId || 'RAW - 000XXX'}`;

    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        item_details: details,
        rate: rate,
        amount: updated[index].quantity * rate,
        tax_rate: 0.10,
        tax_name: 'GST [10%]',
      };
      return updated;
    });
    setActiveItemPickerIndex(null);
    setItemPickerSearch('');
  };

  const handleSelectService = (index: number, service: (typeof PRESET_INVOICE_SERVICES)[0]) => {
    const details = vin ? `${service.name}\nVIN : ${vin}` : service.name;
    const taxRate = service.rate < 0 ? 0 : 0.10;

    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        item_details: details,
        rate: service.rate,
        amount: updated[index].quantity * service.rate,
        tax_rate: taxRate,
        tax_name: taxRate > 0 ? 'GST [10%]' : 'None [0%]',
      };
      return updated;
    });
    setActiveItemPickerIndex(null);
    setItemPickerSearch('');
  };

  const handleApplyBulkItems = () => {
    const newItems: InvoiceItem[] = [];

    // Add selected MREs
    bulkSelectedMres.forEach((mreNo, idx) => {
      const mre = availableReports.find(r => r.mre_no === mreNo);
      if (mre) {
        const rate = getModelReportRate(mre);
        const authorTag = mre.author ? ` (${mre.author})` : '';
        newItems.push({
          id: `bulk_mre_${Date.now()}_${idx}`,
          item_details: `${mre.mre_no} : ${mre.make} ${mre.model}${authorTag}\nVIN : ${vin || 'XXXXXXXXXXXXXXXXX'}\nRAW ID : ${rawId || 'RAW - 000XXX'}`,
          quantity: 1,
          unit: 'pcs',
          rate: rate,
          tax_rate: 0.10,
          tax_name: 'GST [10%]',
          amount: rate,
        });
      }
    });

    // Add selected Services
    bulkSelectedServices.forEach((serviceName, idx) => {
      const s = PRESET_INVOICE_SERVICES.find(srv => srv.name === serviceName);
      if (s) {
        const taxRate = s.rate < 0 ? 0 : 0.10;
        newItems.push({
          id: `bulk_srv_${Date.now()}_${idx}`,
          item_details: vin ? `${s.name}\nVIN : ${vin}` : s.name,
          quantity: 1,
          unit: 'pcs',
          rate: s.rate,
          tax_rate: taxRate,
          tax_name: taxRate > 0 ? 'GST [10%]' : 'None [0%]',
          amount: s.rate,
        });
      }
    });

    if (newItems.length > 0) {
      setItems(prev => {
        if (prev.length === 1 && !prev[0].item_details.trim() && prev[0].rate === 0) {
          return newItems;
        }
        return [...prev, ...newItems];
      });
    }

    setIsBulkModalOpen(false);
    setBulkSelectedMres([]);
    setBulkSelectedServices([]);
  };

  const handleSubmit = async (targetStatus: Invoice['status'], andPreview = false) => {
    if (!customerName.trim()) {
      setErrorMessage('Customer Name is required. Please select or enter a customer.');
      return;
    }
    if (!invoiceNo.trim()) {
      setErrorMessage('Invoice Number is required.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const payload: Omit<Invoice, 'id' | 'created_at' | 'updated_at'> & { id?: string } = {
        invoice_no: invoiceNo.trim(),
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim() || null,
        customer_email: customerEmail.trim() || null,
        customer_phone: customerPhone.trim() || null,
        raw_id: rawId.trim() || null,
        vin: vin.trim() || null,
        folder_no: folderNo.trim() || null,
        invoice_date: invoiceDate,
        terms,
        due_date: dueDate,
        items,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        balance_due: balanceDue,
        status: targetStatus,
        customer_notes: customerNotes,
        terms_and_conditions: DEFAULT_COMPANY_DETAILS.defaultTerms,
      };

      let saved: Invoice;
      if (invoiceToEdit) {
        saved = await invoiceService.update(invoiceToEdit.id, payload);
      } else {
        saved = await invoiceService.create(payload);
      }

      await onSaved(saved, andPreview);
      onClose();
    } catch (err: any) {
      console.error('Invoice save error:', err);
      setErrorMessage(err.message || 'Error saving invoice');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredWorkshops = workshops.filter(w =>
    w.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    w.raw_id.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (w.contact_email && w.contact_email.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-3 sm:my-6 max-h-[94vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 text-sky-800 rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                {invoiceToEdit ? `EDIT INVOICE — ${invoiceToEdit.invoice_no}` : 'NEW INVOICE'}
              </h2>
              <p className="text-xs text-slate-500">
                Model Reports Online & AVV Mate Tax Invoice Generator
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick populate from compliance job */}
          {jobs.length > 0 && !invoiceToEdit && (
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sky-900 font-semibold text-xs">
                <Car className="w-4 h-4 text-sky-600" />
                <span>Quick Autofill from Compliance Job:</span>
              </div>
              <select
                value={selectedJobId}
                onChange={e => {
                  setSelectedJobId(e.target.value);
                  if (e.target.value) handlePopulateFromJob(e.target.value);
                }}
                className="w-full sm:w-auto px-3 py-1.5 bg-white border border-sky-300 rounded text-xs font-mono font-medium focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Select a vehicle job...</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.folder_no} • {j.vin} ({j.make} {j.model})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Row 1: Customer Name */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  placeholder="Select or enter customer name (RAW workshop)..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-semibold focus:ring-2 focus:ring-sky-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Customer Search & Select Dropdown */}
            {isCustomerDropdownOpen && (
              <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-slate-200 sticky top-0 bg-white">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      placeholder="Search RAW workshops..."
                      className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredWorkshops.map(ws => (
                    <button
                      key={ws.raw_id}
                      type="button"
                      onClick={() => handleSelectWorkshop(ws)}
                      className="w-full text-left p-2.5 hover:bg-sky-50 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-800 font-bold flex items-center justify-center text-xs">
                          {ws.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-sky-800 text-xs">
                            {ws.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {ws.raw_id} {ws.contact_email ? `• ${ws.contact_email}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 group-hover:text-sky-700 font-semibold">
                        Select
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomerDropdownOpen(false)}
                    className="w-full text-center py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Close Dropdown
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Invoice#, Date, Terms, Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice # <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="RAW000245-054"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono font-bold text-xs uppercase focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-xs focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Terms
              </label>
              <select
                value={terms}
                onChange={e => setTerms(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium focus:ring-2 focus:ring-sky-500"
              >
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Net 7">Net 7 Days</option>
                <option value="Net 15">Net 15 Days</option>
                <option value="Net 30">Net 30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-xs focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>
          </div>

          {/* Section: Line Items Table (Matches Screenshot 1, 4, 5) */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display font-bold text-xs uppercase tracking-wider text-slate-700">
                Item Table
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Standard Rates (GST Inclusive / Exclusive selectable)
              </span>
            </div>

            <div className="p-3 sm:p-4 space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-2 relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-500 text-[11px]">
                          #{index + 1}
                        </span>

                        {/* Interactive Zoho-style Model Report & Service Selector */}
                        <div className="relative flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveItemPickerIndex(activeItemPickerIndex === index ? null : index);
                              setItemPickerSearch('');
                            }}
                            className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 bg-white hover:bg-sky-50 border border-sky-300 text-sky-900 rounded-md text-xs font-semibold shadow-2xs transition text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Search className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              <span className="truncate">
                                {item.item_details ? item.item_details.split('\n')[0] : 'Click to select Model Report (MRE) or Service...'}
                              </span>
                            </div>
                            <ChevronDown className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          </button>

                          {/* Zoho Dropdown Panel */}
                          {activeItemPickerIndex === index && (
                            <div className="absolute top-full left-0 right-0 mt-1 z-30 p-2.5 bg-white border border-slate-300 rounded-lg shadow-xl space-y-2 animate-in fade-in">
                              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                                  Select Model Report or Service
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveItemPickerIndex(null)}
                                  className="text-[11px] text-slate-400 hover:text-slate-600 font-bold px-1 cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* Search Bar */}
                              <div className="relative">
                                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                                <input
                                  type="text"
                                  autoFocus
                                  value={itemPickerSearch}
                                  onChange={e => setItemPickerSearch(e.target.value)}
                                  placeholder="Search MRE #, Make, Model, or Service..."
                                  className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:ring-1 focus:ring-sky-500"
                                />
                              </div>

                              {/* Category Tabs */}
                              <div className="flex items-center gap-1 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setItemPickerCategory('all')}
                                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${itemPickerCategory === 'all' ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setItemPickerCategory('mre')}
                                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${itemPickerCategory === 'mre' ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Model Reports ({availableReports.length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setItemPickerCategory('services')}
                                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${itemPickerCategory === 'services' ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Services
                                </button>
                              </div>

                              {/* Items Scrollable List */}
                              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded text-left">
                                {/* Model Reports */}
                                {(itemPickerCategory === 'all' || itemPickerCategory === 'mre') && (
                                  <div>
                                    <div className="px-2.5 py-1 bg-slate-100/90 text-[10px] font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                                      Model Reports (MRE Directory)
                                    </div>
                                    {filteredMreList.length === 0 ? (
                                      <div className="px-3 py-2 text-xs text-slate-400 italic">No matching Model Reports</div>
                                    ) : (
                                      filteredMreList.map(mre => {
                                        const rate = getModelReportRate(mre);
                                        return (
                                          <button
                                            key={mre.mre_no}
                                            type="button"
                                            onClick={() => handleSelectModelReport(index, mre)}
                                            className="w-full text-left px-2.5 py-2 hover:bg-sky-50 transition flex items-center justify-between group cursor-pointer"
                                          >
                                            <div className="pr-2">
                                              <div className="text-xs font-semibold text-slate-900 group-hover:text-sky-900">
                                                <span className="font-mono text-sky-800 font-bold">{mre.mre_no}</span>
                                                <span className="mx-1">:</span>
                                                <span>{mre.make} {mre.model}</span>
                                                {mre.author && <span className="text-slate-400 font-normal ml-1 text-[10px]">({mre.author})</span>}
                                              </div>
                                              <div className="text-[10px] text-slate-400">
                                                SEV: {mre.sev_no || '—'} {mre.vcc ? `• VCC: ${mre.vcc}` : ''}
                                              </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                              <span className="text-xs font-mono font-bold text-sky-700">
                                                ${rate.toFixed(2)}
                                              </span>
                                              <span className="text-[9px] text-slate-400 block">+10% GST</span>
                                            </div>
                                          </button>
                                        );
                                      })
                                    )}
                                  </div>
                                )}

                                {/* Services */}
                                {(itemPickerCategory === 'all' || itemPickerCategory === 'services') && (
                                  <div>
                                    <div className="px-2.5 py-1 bg-slate-100/90 text-[10px] font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                                      Compliance Services & Presets
                                    </div>
                                    {filteredServicesList.map(s => (
                                      <button
                                        key={s.name}
                                        type="button"
                                        onClick={() => handleSelectService(index, s)}
                                        className="w-full text-left px-2.5 py-2 hover:bg-sky-50 transition flex items-center justify-between group cursor-pointer"
                                      >
                                        <div className="pr-2">
                                          <div className="text-xs font-semibold text-slate-900 group-hover:text-sky-900">
                                            {s.name}
                                          </div>
                                          {s.description && (
                                            <div className="text-[10px] text-slate-400">
                                              {s.description}
                                            </div>
                                          )}
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className={`text-xs font-mono font-bold ${s.rate < 0 ? 'text-amber-700' : 'text-sky-700'}`}>
                                            ${s.rate.toFixed(2)}
                                          </span>
                                          <span className="text-[9px] text-slate-400 block">{s.rate < 0 ? 'No Tax' : '+10% GST'}</span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <textarea
                        value={item.item_details}
                        onChange={e => handleItemChange(index, 'item_details', e.target.value)}
                        placeholder="Item details (e.g. MRE-000618 : Honda Odyssey, VIN : ..., RAW ID : ...)"
                        rows={3}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs focus:ring-2 focus:ring-sky-500"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(index)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded transition shrink-0 cursor-pointer"
                      title="Remove Item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quantity, Rate, Tax, Amount */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Quantity</span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={item.quantity}
                        onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Rate ($)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.rate}
                        onChange={e => handleItemChange(index, 'rate', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Tax</span>
                      <select
                        value={item.tax_rate}
                        onChange={e => handleItemChange(index, 'tax_rate', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium"
                      >
                        <option value={0.10}>GST [10%]</option>
                        <option value={0}>None [0%]</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Amount ($)</span>
                      <div className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-xs font-mono font-bold text-slate-900 text-right">
                        ${item.amount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded-md transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Row</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <span>Add Items in Bulk</span>
                </button>
              </div>
            </div>
          </div>

          {/* Customer Notes & Totals Breakdown (Matches Screenshot 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Notes (Bank Details printed on invoice)
              </label>
              <textarea
                value={customerNotes}
                onChange={e => setCustomerNotes(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md font-mono text-[11px] leading-relaxed focus:bg-white focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Totals Summary */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 flex flex-col justify-center">
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Sub Total:</span>
                <span className="font-mono">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Total Taxable Amount:</span>
                <span className="font-mono">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>GST (10%):</span>
                <span className="font-mono">${taxAmount.toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-slate-900 text-sm">
                <span>Total ($):</span>
                <span className="font-mono">${totalAmount.toFixed(2)}</span>
              </div>
              <div className="border-t-2 border-slate-400 pt-1.5 flex justify-between font-extrabold text-slate-900 text-base">
                <span>Balance Due:</span>
                <span className="font-mono text-sky-800">${balanceDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer (Matches Screenshot 1 & 2) */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-100 transition"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmit('draft', false)}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-md shadow-2xs transition disabled:opacity-50"
            >
              Save as Draft
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmit(status === 'draft' ? 'sent' : status, true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold rounded-md shadow-2xs transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Save & Preview / Download PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add Items in Bulk Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-sm sm:text-base">
                  Add Items in Bulk
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select multiple Model Reports or standard compliance services to add to this invoice.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search filter */}
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={bulkSearch}
                  onChange={e => setBulkSearch(e.target.value)}
                  placeholder="Filter Model Reports by MRE #, Make, Model, or Service..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Model Reports */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Model Reports (MRE Directory)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {bulkSelectedMres.length} selected
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableReports
                    .filter(r => !bulkSearch.trim() || r.mre_no.toLowerCase().includes(bulkSearch.toLowerCase()) || (r.make && r.make.toLowerCase().includes(bulkSearch.toLowerCase())) || (r.model && r.model.toLowerCase().includes(bulkSearch.toLowerCase())))
                    .map(mre => {
                      const isSelected = bulkSelectedMres.includes(mre.mre_no);
                      const rate = getModelReportRate(mre);
                      return (
                        <div
                          key={mre.mre_no}
                          onClick={() => {
                            if (isSelected) {
                              setBulkSelectedMres(prev => prev.filter(id => id !== mre.mre_no));
                            } else {
                              setBulkSelectedMres(prev => [...prev, mre.mre_no]);
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition flex items-center justify-between ${
                            isSelected ? 'bg-sky-50 border-sky-400 text-sky-950' : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="font-mono font-bold text-sky-800 text-xs">{mre.mre_no}</span>
                            <p className="text-xs font-semibold text-slate-800 truncate">{mre.make} {mre.model}</p>
                            <span className="text-[10px] text-slate-400">Rate: ${rate.toFixed(2)}</span>
                          </div>
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isSelected ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Compliance Services */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Compliance Services
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {bulkSelectedServices.length} selected
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_INVOICE_SERVICES
                    .filter(s => !bulkSearch.trim() || s.name.toLowerCase().includes(bulkSearch.toLowerCase()))
                    .map(s => {
                      const isSelected = bulkSelectedServices.includes(s.name);
                      return (
                        <div
                          key={s.name}
                          onClick={() => {
                            if (isSelected) {
                              setBulkSelectedServices(prev => prev.filter(name => name !== s.name));
                            } else {
                              setBulkSelectedServices(prev => [...prev, s.name]);
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition flex items-center justify-between ${
                            isSelected ? 'bg-sky-50 border-sky-400 text-sky-950' : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-xs text-slate-900">{s.name}</span>
                            <span className="text-[10px] text-slate-400 block">Rate: ${s.rate.toFixed(2)}</span>
                          </div>
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isSelected ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {bulkSelectedMres.length + bulkSelectedServices.length} items selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkSelectedMres.length + bulkSelectedServices.length === 0}
                  onClick={handleApplyBulkItems}
                  className="px-4 py-1.5 text-xs bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-bold rounded-md shadow-xs transition cursor-pointer"
                >
                  Add Selected Items
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
