import React, { useState, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Check, 
  Trash2, 
  ExternalLink, 
  FileText, 
  AlertCircle,
  Video,
  Save,
  Calendar,
  Layers,
  MessageSquare
} from 'lucide-react';
import type { ComplianceJob, Vehicle, RawWorkshop, ModelReport, DocType } from '../../types';
import { REQUIRED_DOC_TYPES } from '../../types';
import { attachmentService } from '../../services/attachmentService';
import { complianceJobService } from '../../services/complianceJobService';
import { formatBytes } from '../../lib/utils';

interface ComplianceJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  jobToEdit?: ComplianceJob | null;
  vehicles: Vehicle[];
  workshops: RawWorkshop[];
  modelReports: ModelReport[];
  onRequestDocs?: (job: ComplianceJob) => void;
}

export const ComplianceJobModal: React.FC<ComplianceJobModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  jobToEdit,
  vehicles,
  workshops,
  modelReports,
  onRequestDocs,
}) => {
  const [folderNo, setFolderNo] = useState('');
  const [vin, setVin] = useState('');
  const [rawId, setRawId] = useState('');
  const [mreNo, setMreNo] = useState('');
  const [requestReceived, setRequestReceived] = useState('');
  const [videosUrl, setVideosUrl] = useState('');
  const [avvVerificationDate, setAvvVerificationDate] = useState('');
  const [ravDateOfEntry, setRavDateOfEntry] = useState('');
  const [status, setStatus] = useState<ComplianceJob['status']>('in_progress');
  const [errorNote, setErrorNote] = useState('');

  // Selected vehicle details (auto-prefilled)
  const [matchedVehicle, setMatchedVehicle] = useState<Vehicle | null>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<Record<DocType, any>>({
    CRE: null, EC: null, CIN: null, WI: null,
    DC: null, VI: null, RAW_DECLA: null, PHOTOS: null
  });
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Initialize or reset form
  useEffect(() => {
    if (!isOpen) return;

    if (jobToEdit) {
      setFolderNo(jobToEdit.folder_no);
      setVin(jobToEdit.vin);
      setRawId(jobToEdit.raw_id || '');
      setMreNo(jobToEdit.mre_no || '');
      setRequestReceived(jobToEdit.request_received || '');
      setVideosUrl(jobToEdit.videos_url || '');
      setAvvVerificationDate(jobToEdit.avv_verification_date || '');
      setRavDateOfEntry(jobToEdit.rav_date_of_entry || '');
      setStatus(jobToEdit.status || 'in_progress');
      setErrorNote(jobToEdit.error_note || '');

      // Load attachments
      attachmentService.getByJobId(jobToEdit.id).then(setAttachments);

      // Match vehicle
      const v = vehicles.find(item => item.vin.toUpperCase() === jobToEdit.vin.toUpperCase());
      setMatchedVehicle(v || null);
    } else {
      // New Job mode
      complianceJobService.getLastFolderNo().then(last => {
        const next = last ? `SVC${String(parseInt(last.replace(/\D/g, '') || '1000', 10) + 1)}` : 'SVC1001';
        setFolderNo(next);
      });
      setVin('');
      setRawId('');
      setMreNo('');
      setRequestReceived(new Date().toISOString().slice(0, 10));
      setVideosUrl('');
      setAvvVerificationDate('');
      setRavDateOfEntry('');
      setStatus('in_progress');
      setErrorNote('');
      setMatchedVehicle(null);
      setAttachments({
        CRE: null, EC: null, CIN: null, WI: null,
        DC: null, VI: null, RAW_DECLA: null, PHOTOS: null
      });
    }
    setErrorMessage('');
  }, [isOpen, jobToEdit, vehicles]);

  // Reactive Autocomplete: When VIN changes, lookup vehicle and prefill RAW ID and MRE
  const handleVinChange = (val: string) => {
    const cleanVin = val.toUpperCase().replace(/\s/g, '');
    setVin(cleanVin);

    const match = vehicles.find(v => v.vin.toUpperCase() === cleanVin);
    if (match) {
      setMatchedVehicle(match);
      if (match.raw_id) setRawId(match.raw_id);
      if (match.mre_no) setMreNo(match.mre_no);
    } else {
      setMatchedVehicle(null);
    }
  };

  // Handle file upload for a specific slot
  const handleFileUpload = async (docType: DocType, file: File) => {
    try {
      setUploadingDoc(docType);
      setErrorMessage('');

      if (jobToEdit?.id) {
        // Direct upload to Supabase
        const att = await attachmentService.uploadFile(jobToEdit.id, docType, file);
        setAttachments(prev => ({ ...prev, [docType]: att }));
      } else {
        // If creating a brand new job before saving, store temporary local preview
        const tempAtt = {
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          file_url: URL.createObjectURL(file),
          _fileObject: file
        };
        setAttachments(prev => ({ ...prev, [docType]: tempAtt }));
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Failed to upload ${docType}: ${err.message || 'Error'}`);
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleDeleteAttachment = async (docType: DocType) => {
    try {
      if (jobToEdit?.id && attachments[docType]?.id) {
        await attachmentService.deleteAttachment(jobToEdit.id, docType, attachments[docType]?.file_url);
      }
      setAttachments(prev => ({ ...prev, [docType]: null }));
    } catch (err: any) {
      setErrorMessage(`Failed to remove ${docType}: ${err.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderNo.trim()) {
      setErrorMessage('Folder number is required');
      return;
    }
    if (!vin.trim()) {
      setErrorMessage('VIN number is required');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      let savedJob: ComplianceJob;

      if (jobToEdit) {
        savedJob = await complianceJobService.update(jobToEdit.id, {
          raw_id: rawId || null,
          mre_no: mreNo || null,
          request_received: requestReceived,
          videos_url: videosUrl || null,
          avv_verification_date: avvVerificationDate || null,
          rav_date_of_entry: ravDateOfEntry || null,
          status,
          error_note: errorNote || null,
        });
      } else {
        savedJob = await complianceJobService.create({
          folder_no: folderNo.toUpperCase().trim(),
          vin: vin.toUpperCase().trim(),
          raw_id: rawId || null,
          mre_no: mreNo || null,
          request_received: requestReceived,
          videos_url: videosUrl || null,
          avv_verification_date: avvVerificationDate || null,
          rav_date_of_entry: ravDateOfEntry || null,
          status,
          error_note: errorNote || null,
        });

        // Upload any queued attachments from creation form
        for (const [docKey, att] of Object.entries(attachments)) {
          if (att?._fileObject) {
            await attachmentService.uploadFile(savedJob.id, docKey as DocType, att._fileObject);
          }
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Save error:', err);
      setErrorMessage(err.message || 'Error saving compliance job');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentWorkshop = workshops.find(w => w.raw_id === rawId);
  const currentMre = modelReports.find(m => m.mre_no === mreNo);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-4 sm:my-8 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg sm:text-xl text-slate-900">
                {jobToEdit ? `EDIT COMPLIANCE JOB — ${jobToEdit.folder_no}` : 'NEW COMPLIANCE JOB ENTRY'}
              </span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold">
                AVV PIPELINE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter vehicle VIN, approvals, non-blocking certificate attachments, and inspection dates
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Identification & Auto-Prefill */}
          <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-display mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-700" />
              1. Job & Vehicle Identification (Smart Prefill)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Folder # <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={folderNo}
                  onChange={e => setFolderNo(e.target.value)}
                  disabled={!!jobToEdit}
                  placeholder="SVC1040"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 focus:outline-hidden disabled:bg-slate-100"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  VIN # (Vehicle Identification Number) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vin}
                    onChange={e => handleVinChange(e.target.value)}
                    disabled={!!jobToEdit}
                    placeholder="Enter or paste 17-char VIN"
                    maxLength={17}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 focus:outline-hidden disabled:bg-slate-100"
                    required
                  />
                  {matchedVehicle && (
                    <span className="absolute right-3 top-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      <Check className="w-3 h-3" /> Auto-Prefilled
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Smart Prefill Results Display Card */}
            <div className="mt-4 pt-3 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* RAW Workshop Selection/Prefill */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  RAW Workshop (Auto-filled from VIN, or select)
                </label>
                <select
                  value={rawId}
                  onChange={e => setRawId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- Select Workshop --</option>
                  {workshops.map(w => (
                    <option key={w.raw_id} value={w.raw_id}>
                      {w.raw_id} • {w.name}
                    </option>
                  ))}
                </select>
                {currentWorkshop && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Name: <span className="text-slate-800 font-semibold">{currentWorkshop.name}</span>
                  </p>
                )}
              </div>

              {/* Model Report Selection/Prefill */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model Report (MRE) (Auto-filled from VIN, or select)
                </label>
                <select
                  value={mreNo}
                  onChange={e => setMreNo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- Select MRE --</option>
                  {modelReports.map(m => (
                    <option key={m.mre_no} value={m.mre_no}>
                      {m.mre_no} • {m.make} {m.model}
                    </option>
                  ))}
                </select>
                {currentMre && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Make/Model: <span className="text-slate-800 font-semibold">{currentMre.make} {currentMre.model}</span> (SEV: {currentMre.sev_no || 'N/A'})
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Progressive Document Attachments (Non-blocking) */}
          <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-display flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-700" />
                  2. Document Attachments (PDF / JPG / PNG)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Optional on creation. Upload what you have today, upload missing ones anytime later.
                </p>
              </div>

              {/* Completeness counter and Request button */}
              <div className="flex items-center gap-2">
                {jobToEdit && Object.values(attachments).filter(Boolean).length < 8 && onRequestDocs && (
                  <button
                    type="button"
                    onClick={() => onRequestDocs(jobToEdit)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition shadow-2xs"
                    title="Send dynamic request via WhatsApp or Email"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Request Missing Docs</span>
                  </button>
                )}
                <span className="text-xs font-mono font-bold px-2 py-1 bg-sky-100 text-sky-800 rounded">
                  {Object.values(attachments).filter(Boolean).length}/8 Uploaded
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {REQUIRED_DOC_TYPES.map(doc => {
                const att = attachments[doc.type];
                const isUploading = uploadingDoc === doc.type;

                return (
                  <div
                    key={doc.type}
                    className={`p-3 rounded-lg border text-xs transition flex flex-col justify-between ${
                      att
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {doc.label}
                        </span>
                        {att ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                            <Check className="w-3 h-3" /> Attached
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium truncate mb-2" title={doc.name}>
                        {doc.name}
                      </p>

                      {att && (
                        <div className="text-[10px] text-slate-600 bg-white/70 p-1.5 rounded border border-emerald-200/60 mb-2 truncate">
                          <p className="font-semibold text-slate-800 truncate" title={att.file_name}>
                            {att.file_name}
                          </p>
                          <p className="text-slate-400 font-mono">
                            {formatBytes(att.file_size)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/60">
                      {att ? (
                        <>
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 transition"
                          >
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(doc.type)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <label className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 rounded border border-slate-200 cursor-pointer transition">
                          <Upload className="w-3 h-3" />
                          <span>{isUploading ? 'Uploading…' : 'Attach'}</span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(doc.type, file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Video / Google Drive Link field */}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-sky-700" />
                  Vehicle Inspection Videos (Google Drive Link / Video URL)
                </span>
                {videosUrl && (
                  <a
                    href={videosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 font-semibold hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <ExternalLink className="w-3 h-3" /> Open Drive
                  </a>
                )}
              </label>
              <input
                type="url"
                value={videosUrl}
                onChange={e => setVideosUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Section 3: Workflow Milestones & Dates */}
          <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-display mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-700" />
              3. Verification Dates & Status
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Request Received <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={requestReceived}
                  onChange={e => setRequestReceived(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  AVV Verification Date
                </label>
                <input
                  type="date"
                  value={avvVerificationDate}
                  onChange={e => setAvvVerificationDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  RAV Date of Entry
                </label>
                <input
                  type="date"
                  value={ravDateOfEntry}
                  onChange={e => setRavDateOfEntry(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Pipeline Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-semibold focus:ring-2 focus:ring-sky-500"
                >
                  <option value="in_progress">🟡 In Progress (Document Collection / Inspection)</option>
                  <option value="verified">🔵 Verified by AVV (Ready for RAV Submission)</option>
                  <option value="rav_entered">🟢 RAV Entered (Officially Road Registered)</option>
                  <option value="errored">🔴 Errored Entry (Superseded or Audited)</option>
                </select>
              </div>

              {status === 'errored' && (
                <div>
                  <label className="block text-xs font-semibold text-red-700 mb-1">
                    Error Description / Audit Note
                  </label>
                  <input
                    type="text"
                    value={errorNote}
                    onChange={e => setErrorNote(e.target.value)}
                    placeholder="Describe what was wrong in the RAV submission..."
                    className="w-full px-3 py-2 bg-red-50 border border-red-300 rounded-md text-sm text-red-900 focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
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
              <span>{isSaving ? 'Saving…' : jobToEdit ? 'Save Changes' : 'Create Job'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
