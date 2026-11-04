import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Download, FileText, Edit3, Trash2, Car } from 'lucide-react';
import type { Vehicle } from '../../types';
import { exportService } from '../../services/exportService';
import { Pagination } from '../common/Pagination';

interface VehiclesViewProps {
  vehicles: Vehicle[];
  onNewVehicle: () => void;
  onEditVehicle: (vehicle: Vehicle) => void;
  onDeleteVehicle: (vehicle: Vehicle) => void;
}

export const VehiclesView: React.FC<VehiclesViewProps> = ({
  vehicles,
  onNewVehicle,
  onEditVehicle,
  onDeleteVehicle,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset to page 1 whenever search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        v.vin.toLowerCase().includes(q) ||
        (v.unique_id && v.unique_id.toLowerCase().includes(q)) ||
        (v.via_no && v.via_no.toLowerCase().includes(q)) ||
        (v.raw_id && v.raw_id.toLowerCase().includes(q)) ||
        (v.raw_workshop_name && v.raw_workshop_name.toLowerCase().includes(q)) ||
        (v.mre_no && v.mre_no.toLowerCase().includes(q)) ||
        (v.make && v.make.toLowerCase().includes(q)) ||
        (v.model && v.model.toLowerCase().includes(q))
      );
    });
  }, [vehicles, searchTerm]);

  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVehicles.slice(start, start + pageSize);
  }, [filteredVehicles, currentPage, pageSize]);

  const handleExportCsv = () => {
    const data = filteredVehicles.map(v => ({
      'VIN': v.vin,
      'Unique ID': v.unique_id || '',
      'Build Date': v.build_date,
      'VIA #': v.via_no || '',
      'RAW ID': v.raw_id || '',
      'Workshop Name': v.raw_workshop_name || '',
      'MRE No': v.mre_no || '',
      'Make': v.make || '',
      'Model': v.model || '',
    }));
    exportService.exportToCsv('vehicles_master', data);
  };

  const handleExportPdf = () => {
    exportService.exportVehiclesPdf(filteredVehicles);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Header Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 tracking-tight">
              REGISTERED VEHICLES MASTER
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 font-mono font-semibold text-slate-700">
              {filteredVehicles.length} {filteredVehicles.length === 1 ? 'Vehicle' : 'Vehicles'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Vehicle directory linking VIN numbers, build dates, VIA approvals, workshops, and MRE reports
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCsv}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportPdf}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <FileText className="w-3.5 h-3.5 text-red-600" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={onNewVehicle}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Register Vehicle</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 sm:p-3.5 border-b border-slate-200 bg-white">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by VIN, VIA#, Workshop, Make, or Model..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Mobile swipe helper */}
      <div className="md:hidden px-4 py-1.5 bg-sky-50/70 border-b border-sky-100 text-[11px] text-sky-800 flex items-center justify-between font-medium">
        <span>👉 Swipe table to view full specs</span>
        <span className="font-semibold text-sky-900 bg-sky-100 px-1.5 py-0.5 rounded text-[10px]">Actions pinned</span>
      </div>

      {/* Table matching Image 3 (Vehicles) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 font-display uppercase tracking-wider text-slate-600 text-[11px]">
              <th className="py-2.5 px-4 font-bold bg-sky-50/50">VIN</th>
              <th className="py-2.5 px-4 font-bold bg-sky-100/60 text-sky-950">Unique ID</th>
              <th className="py-2.5 px-4 font-bold">Build Date</th>
              <th className="py-2.5 px-4 font-bold bg-red-50/50">VIA #</th>
              <th className="py-2.5 px-4 font-bold bg-red-50/30">RAW ID</th>
              <th className="py-2.5 px-4 font-bold">RAW Workshop Name</th>
              <th className="py-2.5 px-4 font-bold bg-amber-50/30">MRE</th>
              <th className="py-2.5 px-4 font-bold">Make</th>
              <th className="py-2.5 px-4 font-bold">Model</th>
              <th className="py-2.5 px-4 font-bold text-right sticky right-0 bg-slate-100 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400">
                  <Car className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-sm">No vehicles registered</p>
                  <p className="text-xs mt-1">Click "Register Vehicle" to add the first vehicle.</p>
                </td>
              </tr>
            ) : (
              paginatedVehicles.map(vehicle => (
                <tr 
                  key={vehicle.vin} 
                  className="hover:bg-sky-50/40 transition group cursor-pointer"
                  onClick={() => onEditVehicle(vehicle)}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 group-hover:text-sky-700 whitespace-nowrap bg-sky-50/30">
                    {vehicle.vin}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap bg-sky-50/20">
                    {vehicle.unique_id ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-sky-100 text-sky-900 border border-sky-300 shadow-2xs">
                        {vehicle.unique_id}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {vehicle.build_date}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-red-800 bg-red-50/30 whitespace-nowrap">
                    {vehicle.via_no || '—'}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-800 bg-red-50/20 whitespace-nowrap">
                    {vehicle.raw_id || '—'}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                    {vehicle.raw_workshop_name || '—'}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-amber-900 bg-amber-50/20 whitespace-nowrap">
                    {vehicle.mre_no || '—'}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {vehicle.make || '—'}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {vehicle.model || '—'}
                  </td>
                  <td 
                    className="py-3 px-4 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-sky-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]" 
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEditVehicle(vehicle)}
                        className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-100 rounded transition"
                        title="Edit Vehicle"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteVehicle(vehicle)}
                        className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-100 rounded transition"
                        title="Delete Vehicle"
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

      {/* Pagination controls */}
      <Pagination
        currentPage={currentPage}
        totalItems={filteredVehicles.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        itemName="vehicles"
      />
    </div>
  );
};

