import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, FileText } from 'lucide-react';
import type { ModelReport } from '../../types';
import { modelReportService } from '../../services/modelReportService';

interface ModelReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (report: ModelReport) => void | Promise<void>;
  reportToEdit?: ModelReport | null;
}

export const ModelReportModal: React.FC<ModelReportModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  reportToEdit,
}) => {
  const [mreNo, setMreNo] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [sevNo, setSevNo] = useState('');
  const [buildFrom, setBuildFrom] = useState('');
  const [buildTo, setBuildTo] = useState('');
  const [sevBuildFrom, setSevBuildFrom] = useState('');
  const [sevBuildTo, setSevBuildTo] = useState('');
  const [vcc, setVcc] = useState('');
  const [tareKg, setTareKg] = useState<number | ''>('');
  const [powerKw, setPowerKw] = useState<number | ''>('');
  const [seats, setSeats] = useState<number | ''>('');
  const [author, setAuthor] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (reportToEdit) {
      setMreNo(reportToEdit.mre_no);
      setMake(reportToEdit.make);
      setModel(reportToEdit.model);
      setSevNo(reportToEdit.sev_no || '');
      setBuildFrom(reportToEdit.build_from || '');
      setBuildTo(reportToEdit.build_to || '');
      setSevBuildFrom(reportToEdit.sev_build_from || '');
      setSevBuildTo(reportToEdit.sev_build_to || '');
      setVcc(reportToEdit.vcc || '');
      setTareKg(reportToEdit.tare_kg ?? '');
      setPowerKw(reportToEdit.power_kw ?? '');
      setSeats(reportToEdit.seats ?? '');
      setAuthor(reportToEdit.author || '');
      setUniqueId(reportToEdit.unique_id || '');
    } else {
      setMreNo('');
      setMake('');
      setModel('');
      setSevNo('');
      setBuildFrom('');
      setBuildTo('');
      setSevBuildFrom('');
      setSevBuildTo('');
      setVcc('');
      setTareKg('');
      setPowerKw('');
      setSeats('');
      setAuthor('');
      setUniqueId('');
    }
    setErrorMessage('');
  }, [isOpen, reportToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mreNo.trim()) {
      setErrorMessage('MRE No is required (e.g. MRE-000008)');
      return;
    }
    if (!make.trim() || !model.trim()) {
      setErrorMessage('Make and Model are required');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      let savedReport: ModelReport;
      const cleanMreNo = mreNo.toUpperCase().trim();
      const cleanMake = make.trim();
      const cleanModel = model.trim();
      const cleanSevNo = sevNo.trim() || null;
      const cleanBuildFrom = buildFrom || null;
      const cleanBuildTo = buildTo || null;
      const cleanSevBuildFrom = sevBuildFrom || null;
      const cleanSevBuildTo = sevBuildTo || null;
      const cleanVcc = vcc.trim() || null;
      const cleanTare = tareKg === '' ? null : Number(tareKg);
      const cleanPower = powerKw === '' ? null : Number(powerKw);
      const cleanSeats = seats === '' ? null : Number(seats);
      const cleanAuthor = author.trim() || null;
      const cleanUniqueId = uniqueId.trim() || null;

      try {
        if (reportToEdit) {
          savedReport = await modelReportService.update(reportToEdit.mre_no, {
            make: cleanMake,
            model: cleanModel,
            sev_no: cleanSevNo,
            build_from: cleanBuildFrom,
            build_to: cleanBuildTo,
            sev_build_from: cleanSevBuildFrom,
            sev_build_to: cleanSevBuildTo,
            vcc: cleanVcc,
            tare_kg: cleanTare,
            power_kw: cleanPower,
            seats: cleanSeats,
            author: cleanAuthor,
            unique_id: cleanUniqueId,
          } as any);
        } else {
          savedReport = await modelReportService.create({
            mre_no: cleanMreNo,
            make: cleanMake,
            model: cleanModel,
            sev_no: cleanSevNo,
            build_from: cleanBuildFrom,
            build_to: cleanBuildTo,
            sev_build_from: cleanSevBuildFrom,
            sev_build_to: cleanSevBuildTo,
            vcc: cleanVcc,
            tare_kg: cleanTare,
            power_kw: cleanPower,
            seats: cleanSeats,
            author: cleanAuthor,
            unique_id: cleanUniqueId,
          } as any);
        }
      } catch (sbErr) {
        console.warn('Supabase model report save bypassed or failed, creating/updating locally:', sbErr);
        savedReport = {
          mre_no: cleanMreNo,
          unique_id: cleanUniqueId,
          make: cleanMake,
          model: cleanModel,
          sev_no: cleanSevNo,
          build_from: cleanBuildFrom,
          build_to: cleanBuildTo,
          sev_build_from: cleanSevBuildFrom,
          sev_build_to: cleanSevBuildTo,
          vcc: cleanVcc,
          tare_kg: cleanTare,
          power_kw: cleanPower,
          seats: cleanSeats,
          author: cleanAuthor,
          created_at: reportToEdit?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      if (savedReport) {
        savedReport.unique_id = cleanUniqueId;
      }

      await onSaved(savedReport);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error saving model report');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-4 sm:my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 text-sky-800 rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                {reportToEdit ? `EDIT MODEL REPORT — ${reportToEdit.mre_no}` : 'ADD MODEL REPORT (MRE)'}
              </h2>
              <p className="text-xs text-slate-500">
                Configure MRE approvals, SEV linkages, and vehicle technical standards
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
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                MRE No <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={mreNo}
                onChange={e => setMreNo(e.target.value)}
                disabled={!!reportToEdit}
                placeholder="MRE-000008"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Make <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={make}
                onChange={e => setMake(e.target.value)}
                placeholder="Toyota"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-semibold focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Model <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="Crown"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-semibold focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SEV No (SEV #)
              </label>
              <input
                type="text"
                value={sevNo}
                onChange={e => setSevNo(e.target.value)}
                placeholder="SEV-000696"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Author (Supplier / Owner)
              </label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="e.g. CPT, J-Spec..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-semibold focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Model Report Unique ID
              </label>
              <input
                type="text"
                value={uniqueId}
                onChange={e => setUniqueId(e.target.value)}
                placeholder="e.g. UID-0008, CPT-001..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Vehicle Category Code (VCC)
            </label>
            <select
              value={vcc}
              onChange={e => setVcc(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Select VCC...</option>
              <option value="MA">MA • Passenger Car</option>
              <option value="MB">MB • Forward-Control Passenger</option>
              <option value="MC">MC • Off-Road Passenger (SUV)</option>
              <option value="NA">NA • Light Goods (&le; 3.5t)</option>
              <option value="NB1">NB1 • Medium Goods (3.5t - 4.5t)</option>
              <option value="NB2">NB2 • Medium Goods (4.5t - 12t)</option>
            </select>
          </div>

          {/* Date Ranges (MRE & SEV) */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-display">
              Build Date Ranges (MRE & SEV Approvals)
            </h4>

            {/* MRE Date Range */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Build Date Range (MRE Approval)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">From Date</span>
                  <input
                    type="date"
                    value={buildFrom}
                    onChange={e => setBuildFrom(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">To Date (Leave blank if open)</span>
                  <input
                    type="date"
                    value={buildTo}
                    onChange={e => setBuildTo(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* SEV Date Range */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Build Date Range (SEV Approval)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">SEV From Date</span>
                  <input
                    type="date"
                    value={sevBuildFrom}
                    onChange={e => setSevBuildFrom(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">SEV To Date (Leave blank if open)</span>
                  <input
                    type="date"
                    value={sevBuildTo}
                    onChange={e => setSevBuildTo(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Technical Specifications (Magenta columns in Google Sheet) */}
          <div className="bg-fuchsia-50/50 p-3.5 rounded-lg border border-fuchsia-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-fuchsia-900 mb-2 font-display">
              Technical Specifications (Auto-inherited by vehicles)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-fuchsia-800 mb-1">
                  Tare (kg)
                </label>
                <input
                  type="number"
                  value={tareKg}
                  onChange={e => setTareKg(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="1260"
                  className="w-full px-3 py-2 bg-white border border-fuchsia-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-fuchsia-800 mb-1">
                  Power (kW)
                </label>
                <input
                  type="number"
                  value={powerKw}
                  onChange={e => setPowerKw(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="90"
                  className="w-full px-3 py-2 bg-white border border-fuchsia-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-fuchsia-800 mb-1">
                  Seats
                </label>
                <input
                  type="number"
                  value={seats}
                  onChange={e => setSeats(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="5"
                  className="w-full px-3 py-2 bg-white border border-fuchsia-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold rounded-md shadow transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : reportToEdit ? 'Save Changes' : 'Add Model Report'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

