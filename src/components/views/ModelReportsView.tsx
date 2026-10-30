import React, { useState, useMemo } from 'react';
import { Search, Plus, Download, Edit3, Trash2, FileText } from 'lucide-react';
import type { ModelReport } from '../../types';
import { exportService } from '../../services/exportService';

interface ModelReportsViewProps {
  modelReports: ModelReport[];
  onNewReport: () => void;
  onEditReport: (report: ModelReport) => void;
  onDeleteReport: (report: ModelReport) => void;
}

export const ModelReportsView: React.FC<ModelReportsViewProps> = ({
  modelReports,
  onNewReport,
  onEditReport,
  onDeleteReport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredReports = useMemo(() => {
    return modelReports.filter(r => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        r.mre_no.toLowerCase().includes(q) ||
        (r.sev_no && r.sev_no.toLowerCase().includes(q)) ||
        r.make.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        (r.vcc && r.vcc.toLowerCase().includes(q))
      );
    });
  }, [modelReports, searchTerm]);

  const handleExportCsv = () => {
    const data = filteredReports.map(r => ({
      'MRE No': r.mre_no,
      'Build Date Range (MRE)': `${r.build_from || ''} - ${r.build_to || ''}`,
      'SEV No': r.sev_no || '',
      'Build Date Range (SEV)': `${r.sev_build_from || ''} - ${r.sev_build_to || ''}`,
      'Make': r.make,
      'Model': r.model,
      'VCC': r.vcc || '',
      'Tare (kg)': r.tare_kg || '',
      'Power (kW)': r.power_kw || '',
      'Seats': r.seats || '',
    }));
    exportService.exportToCsv('model_reports', data);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Header Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-xl text-slate-900 tracking-tight">
              MODEL REPORTS (MRE) DIRECTORY
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 font-mono font-semibold text-slate-700">
              {filteredReports.length} {filteredReports.length === 1 ? 'Report' : 'Reports'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Approved Model Reports, SEV linkages, and vehicle technical standards
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onNewReport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Model Report</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3.5 border-b border-slate-200 bg-white">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by MRE, SEV, Make, or Model..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Table matching Image 1 (Model Reports) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 font-display uppercase tracking-wider text-slate-600 text-[11px]">
              <th className="py-2.5 px-4 font-bold bg-sky-50/70">MRE No</th>
              <th className="py-2.5 px-4 font-bold">Build Date Range (MRE)</th>
              <th className="py-2.5 px-4 font-bold bg-amber-50/50">SEV No</th>
              <th className="py-2.5 px-4 font-bold">Build Date Range (SEV)</th>
              <th className="py-2.5 px-4 font-bold">Make</th>
              <th className="py-2.5 px-4 font-bold">Model</th>
              {/* Magenta Columns */}
              <th className="py-2.5 px-3 font-bold bg-fuchsia-600 text-white text-center">VCC</th>
              <th className="py-2.5 px-3 font-bold bg-fuchsia-600 text-white text-center">Tare</th>
              <th className="py-2.5 px-3 font-bold bg-fuchsia-600 text-white text-center">Power (kW)</th>
              <th className="py-2.5 px-3 font-bold bg-fuchsia-600 text-white text-center">Seats</th>
              <th className="py-2.5 px-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400">
                  <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-sm">No model reports found</p>
                  <p className="text-xs mt-1">Click "Add Model Report" to add an approved MRE.</p>
                </td>
              </tr>
            ) : (
              filteredReports.map(report => (
                <tr 
                  key={report.mre_no} 
                  className="hover:bg-sky-50/40 transition group cursor-pointer"
                  onClick={() => onEditReport(report)}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 group-hover:text-sky-700 whitespace-nowrap bg-sky-50/30">
                    {report.mre_no}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {report.build_from || report.build_to ? `${report.build_from || '—'} to ${report.build_to || '—'}` : '—'}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-amber-900 bg-amber-50/30 whitespace-nowrap">
                    {report.sev_no || '—'}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {report.sev_build_from || report.sev_build_to ? `${report.sev_build_from || '—'} to ${report.sev_build_to || '—'}` : '—'}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {report.make}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {report.model}
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-center text-fuchsia-900 bg-fuchsia-50/40 whitespace-nowrap">
                    {report.vcc || '—'}
                  </td>
                  <td className="py-3 px-3 font-mono text-center text-fuchsia-900 bg-fuchsia-50/40 whitespace-nowrap">
                    {report.tare_kg ? `${report.tare_kg} kg` : '—'}
                  </td>
                  <td className="py-3 px-3 font-mono text-center text-fuchsia-900 bg-fuchsia-50/40 whitespace-nowrap">
                    {report.power_kw ? `${report.power_kw} kW` : '—'}
                  </td>
                  <td className="py-3 px-3 font-mono text-center text-fuchsia-900 bg-fuchsia-50/40 whitespace-nowrap">
                    {report.seats || '—'}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEditReport(report)}
                        className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded transition"
                        title="Edit Model Report"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteReport(report)}
                        className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded transition"
                        title="Delete Model Report"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

