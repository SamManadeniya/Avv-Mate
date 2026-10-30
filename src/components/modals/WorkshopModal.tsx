import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Wrench } from 'lucide-react';
import type { RawWorkshop } from '../../types';
import { workshopService } from '../../services/workshopService';

interface WorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  workshopToEdit?: RawWorkshop | null;
}

export const WorkshopModal: React.FC<WorkshopModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  workshopToEdit,
}) => {
  const [rawId, setRawId] = useState('');
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (workshopToEdit) {
      setRawId(workshopToEdit.raw_id);
      setName(workshopToEdit.name);
      setContactEmail(workshopToEdit.contact_email || '');
      setContactPhone(workshopToEdit.contact_phone || '');
    } else {
      setRawId('');
      setName('');
      setContactEmail('');
      setContactPhone('');
    }
    setErrorMessage('');
  }, [isOpen, workshopToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawId.trim()) {
      setErrorMessage('RAW ID is required (e.g. RAW-000153)');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Workshop Name is required');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      if (workshopToEdit) {
        await workshopService.update(workshopToEdit.raw_id, {
          name: name.trim(),
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
        });
      } else {
        await workshopService.create({
          raw_id: rawId.toUpperCase().trim(),
          name: name.trim(),
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error saving workshop');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 text-sky-800 rounded-lg">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                {workshopToEdit ? `EDIT WORKSHOP — ${workshopToEdit.raw_id}` : 'ADD RAW WORKSHOP'}
              </h2>
              <p className="text-xs text-slate-500">
                Registered Automotive Workshop (RAW) directory entry
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              RAW ID (e.g. RAW-000153) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={rawId}
              onChange={e => setRawId(e.target.value)}
              disabled={!!workshopToEdit}
              placeholder="RAW-000153"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              RAW Workshop Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="AKINA SPEEDSTARS PTY LTD"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-semibold text-slate-800 uppercase focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="compliance@workshop.com.au"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="+61 2 9876 5432"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
              />
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
              <span>{isSaving ? 'Saving…' : workshopToEdit ? 'Save Changes' : 'Add Workshop'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

