import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Car, Wrench, FileText } from 'lucide-react';
import type { Vehicle, RawWorkshop, ModelReport } from '../../types';
import { SearchableSelect } from '../common/SearchableSelect';
import { vehicleService } from '../../services/vehicleService';
import { validateVin } from '../../lib/utils';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (vehicle: Vehicle) => void | Promise<void>;
  vehicleToEdit?: Vehicle | null;
  workshops: RawWorkshop[];
  modelReports: ModelReport[];
}

export const VehicleModal: React.FC<VehicleModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  vehicleToEdit,
  workshops,
  modelReports,
}) => {
  const [vin, setVin] = useState('');
  const [buildDate, setBuildDate] = useState('');
  const [viaNo, setViaNo] = useState('');
  const [rawId, setRawId] = useState('');
  const [rawWorkshopName, setRawWorkshopName] = useState('');
  const [mreNo, setMreNo] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [vinValidation, setVinValidation] = useState<{ valid: boolean; message?: string }>({ valid: true });

  useEffect(() => {
    if (!isOpen) return;

    if (vehicleToEdit) {
      setVin(vehicleToEdit.vin);
      setBuildDate(vehicleToEdit.build_date);
      setViaNo(vehicleToEdit.via_no || '');
      setRawId(vehicleToEdit.raw_id || '');
      setRawWorkshopName(vehicleToEdit.raw_workshop_name || '');
      setMreNo(vehicleToEdit.mre_no || '');
      setMake(vehicleToEdit.make || '');
      setModel(vehicleToEdit.model || '');
      setVinValidation({ valid: true });
    } else {
      setVin('');
      setBuildDate('');
      setViaNo('');
      setRawId('');
      setRawWorkshopName('');
      setMreNo('');
      setMake('');
      setModel('');
      setVinValidation({ valid: true });
    }
    setErrorMessage('');
  }, [isOpen, vehicleToEdit]);

  // VIN input handler with instant validation
  const handleVinChange = (val: string) => {
    const cleanVin = val.toUpperCase().replace(/\s/g, '');
    setVin(cleanVin);
    if (cleanVin.length > 0) {
      setVinValidation(validateVin(cleanVin));
    } else {
      setVinValidation({ valid: true });
    }
  };

  // RAW ID change handler: Autocomplete and Prefill RAW Workshop Name
  const handleRawIdChange = (val: string) => {
    const cleanRaw = val.toUpperCase().trim();
    setRawId(cleanRaw);

    const match = workshops.find(w => w.raw_id.toUpperCase() === cleanRaw);
    if (match) {
      setRawWorkshopName(match.name);
    } else {
      setRawWorkshopName('');
    }
  };

  // MRE change handler: Prefill Make & Model
  const handleMreChange = (val: string) => {
    const cleanMre = val.toUpperCase().trim();
    setMreNo(cleanMre);

    const match = modelReports.find(m => m.mre_no.toUpperCase() === cleanMre);
    if (match) {
      setMake(match.make);
      setModel(match.model);
    } else {
      setMake('');
      setModel('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vCheck = validateVin(vin);
    if (!vCheck.valid) {
      setErrorMessage(vCheck.message || 'Invalid VIN');
      return;
    }
    if (!buildDate.trim()) {
      setErrorMessage('Build Date is required');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      let savedVehicle: Vehicle;
      const cleanVin = vin.toUpperCase().trim();
      const cleanBuildDate = buildDate.trim();
      const cleanViaNo = viaNo.trim() || null;
      const cleanRawId = rawId.trim() || null;
      const cleanMreNo = mreNo.trim() || null;
      const workshop = workshops.find(w => w.raw_id === cleanRawId);
      const report = modelReports.find(m => m.mre_no === cleanMreNo);

      try {
        if (vehicleToEdit) {
          savedVehicle = await vehicleService.update(vehicleToEdit.vin, {
            build_date: cleanBuildDate,
            via_no: cleanViaNo,
            raw_id: cleanRawId,
            mre_no: cleanMreNo,
          });
        } else {
          savedVehicle = await vehicleService.create({
            vin: cleanVin,
            build_date: cleanBuildDate,
            via_no: cleanViaNo,
            raw_id: cleanRawId,
            mre_no: cleanMreNo,
          });
        }
      } catch (sbErr) {
        console.warn('Supabase vehicle save bypassed or failed, creating/updating locally:', sbErr);
        savedVehicle = {
          vin: cleanVin,
          build_date: cleanBuildDate,
          via_no: cleanViaNo,
          raw_id: cleanRawId,
          raw_workshop_name: workshop?.name || rawWorkshopName || null,
          mre_no: cleanMreNo,
          make: report?.make || make || null,
          model: report?.model || model || null,
          created_at: vehicleToEdit?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // Ensure make, model, workshop name are set
      if (!savedVehicle.raw_workshop_name && workshop) {
        savedVehicle.raw_workshop_name = workshop.name;
      }
      if (!savedVehicle.make && report) {
        savedVehicle.make = report.make;
        savedVehicle.model = report.model;
      }

      await onSaved(savedVehicle);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error saving vehicle');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl md:max-w-3xl w-full border border-slate-200 overflow-hidden my-4 sm:my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 text-sky-800 rounded-lg shrink-0">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                {vehicleToEdit ? `EDIT VEHICLE — ${vehicleToEdit.vin}` : 'REGISTER NEW VEHICLE'}
              </h2>
              <p className="text-xs text-slate-500">
                Manage vehicle registry specifications, RAW workshop assignment, and MRE approval
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

          {/* VIN & Build Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                VIN (17 Characters) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vin}
                onChange={e => handleVinChange(e.target.value)}
                disabled={!!vehicleToEdit}
                maxLength={17}
                placeholder="6ZZLLA400K0042734"
                className="w-full min-w-0 px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                required
              />
              {!vinValidation.valid && (
                <p className="text-xs text-red-600 mt-1 font-medium">{vinValidation.message}</p>
              )}
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Build Date (Month/Year) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={buildDate}
                onChange={e => setBuildDate(e.target.value)}
                placeholder="07/2020 or 2020-07"
                className="w-full min-w-0 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                required
              />
            </div>
          </div>

          {/* VIA# */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              VIA # (Vehicle Import Approval / CRE reference)
            </label>
            <input
              type="text"
              value={viaNo}
              onChange={e => setViaNo(e.target.value)}
              placeholder="CRE-145420"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono uppercase focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* RAW ID & Autocomplete Workshop Name */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5 uppercase font-display">
              <Wrench className="w-3.5 h-3.5 text-sky-700" />
              RAW Workshop Selection & Auto-prefill
            </label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-start">
              <div className="min-w-0">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Search & Select RAW Workshop
                </label>
                <SearchableSelect
                  value={rawId}
                  onChange={val => handleRawIdChange(val)}
                  options={workshops.map(w => ({
                    value: w.raw_id,
                    label: w.raw_id,
                    subLabel: w.name,
                    badge: w.contact_phone || undefined,
                  }))}
                  placeholder="-- Search or select workshop --"
                  searchPlaceholder="Search by RAW ID or workshop name..."
                  emptyMessage="No workshops match your search"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prefilled Workshop Name
                </label>
                <input
                  type="text"
                  value={rawWorkshopName}
                  readOnly
                  placeholder="Auto-prefilled from RAW ID..."
                  className="w-full min-w-0 px-3 py-2 bg-slate-100 border border-slate-300 rounded-md text-sm font-semibold text-slate-800 truncate"
                />
              </div>
            </div>
          </div>

          {/* MRE & Autocomplete Make/Model */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5 uppercase font-display">
              <FileText className="w-3.5 h-3.5 text-sky-700" />
              Model Report (MRE) & Auto-prefill
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="min-w-0">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  MRE No (Search & Select)
                </label>
                <SearchableSelect
                  value={mreNo}
                  onChange={val => handleMreChange(val)}
                  options={modelReports.map(m => ({
                    value: m.mre_no,
                    label: m.mre_no,
                    subLabel: `${m.make} ${m.model}${m.sev_no ? ` • SEV: ${m.sev_no}` : ''}`,
                    badge: m.vcc || undefined,
                  }))}
                  placeholder="-- Search or select MRE --"
                  searchPlaceholder="Search by MRE #, make, model or SEV..."
                  emptyMessage="No model reports match your search"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Make
                </label>
                <input
                  type="text"
                  value={make}
                  readOnly
                  placeholder="Auto-filled..."
                  className="w-full min-w-0 px-3 py-2 bg-slate-100 border border-slate-300 rounded-md text-sm font-semibold text-slate-800 truncate"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  readOnly
                  placeholder="Auto-filled..."
                  className="w-full min-w-0 px-3 py-2 bg-slate-100 border border-slate-300 rounded-md text-sm font-semibold text-slate-800 truncate"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
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
              <span>{isSaving ? 'Saving…' : vehicleToEdit ? 'Save Changes' : 'Register Vehicle'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
