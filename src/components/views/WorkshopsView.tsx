import React, { useState, useMemo } from 'react';
import { Search, Plus, Download, Edit3, Trash2, Wrench, Mail, Phone } from 'lucide-react';
import type { RawWorkshop } from '../../types';
import { exportService } from '../../services/exportService';

interface WorkshopsViewProps {
  workshops: RawWorkshop[];
  onNewWorkshop: () => void;
  onEditWorkshop: (workshop: RawWorkshop) => void;
  onDeleteWorkshop: (workshop: RawWorkshop) => void;
}

export const WorkshopsView: React.FC<WorkshopsViewProps> = ({
  workshops,
  onNewWorkshop,
  onEditWorkshop,
  onDeleteWorkshop,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredWorkshops = useMemo(() => {
    return workshops.filter(w => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        w.raw_id.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        (w.contact_email && w.contact_email.toLowerCase().includes(q)) ||
        (w.contact_phone && w.contact_phone.toLowerCase().includes(q))
      );
    });
  }, [workshops, searchTerm]);

  const handleExportCsv = () => {
    const data = filteredWorkshops.map(w => ({
      'RAW ID': w.raw_id,
      'RAW Workshop Name': w.name,
      'Total Vehicles': w.total_vehicles || 0,
      'Contact Email': w.contact_email || '',
      'Contact Phone': w.contact_phone || '',
    }));
    exportService.exportToCsv('raw_workshops', data);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Header Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-xl text-slate-900 tracking-tight">
              REGISTERED AUTOMOTIVE WORKSHOPS (RAW)
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 font-mono font-semibold text-slate-700">
              {filteredWorkshops.length} {filteredWorkshops.length === 1 ? 'Workshop' : 'Workshops'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Directory of approved RAW workshops submitting vehicles for AVV verification
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
            onClick={onNewWorkshop}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Workshop</span>
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
            placeholder="Search by RAW ID or Workshop Name..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Table matching Image 2 (RAW Workshop) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 font-display uppercase tracking-wider text-slate-600 text-[11px]">
              <th className="py-2.5 px-4 font-bold bg-sky-900 text-white">RAW ID</th>
              <th className="py-2.5 px-4 font-bold bg-sky-900 text-white">RAW Workshop Name</th>
              <th className="py-2.5 px-4 font-bold bg-fuchsia-600 text-white text-center">Total Vehicles</th>
              <th className="py-2.5 px-4 font-bold">Contact Email</th>
              <th className="py-2.5 px-4 font-bold">Contact Phone</th>
              <th className="py-2.5 px-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredWorkshops.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <Wrench className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-sm">No workshops registered</p>
                  <p className="text-xs mt-1">Click "Add Workshop" to register a new RAW approval.</p>
                </td>
              </tr>
            ) : (
              filteredWorkshops.map(workshop => (
                <tr 
                  key={workshop.raw_id} 
                  className="hover:bg-sky-50/40 transition group cursor-pointer"
                  onClick={() => onEditWorkshop(workshop)}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 group-hover:text-sky-700 whitespace-nowrap">
                    {workshop.raw_id}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 uppercase whitespace-nowrap">
                    {workshop.name}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-fuchsia-900 bg-fuchsia-50/40 text-center whitespace-nowrap">
                    {workshop.total_vehicles || 0}
                  </td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {workshop.contact_email ? (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {workshop.contact_email}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {workshop.contact_phone ? (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {workshop.contact_phone}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEditWorkshop(workshop)}
                        className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded transition"
                        title="Edit Workshop"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteWorkshop(workshop)}
                        className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded transition"
                        title="Delete Workshop"
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

