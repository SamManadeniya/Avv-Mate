import React from 'react';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  FileText, 
  Images, 
  Film, 
  Trash2, 
  ArrowRight,
  Loader2
} from 'lucide-react';
import type { AutoMatchFile, AutoMatchTarget } from '../../utils/documentAutoMatcher';
import { CORE_DOC_SLOTS } from '../../utils/documentAutoMatcher';
import { formatBytes } from '../../lib/utils';

interface AutoSortReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: AutoMatchFile[];
  onUpdateMatch: (id: string, newTarget: AutoMatchTarget) => void;
  onConfirm: () => void;
  isProcessing?: boolean;
  vinConflict?: {
    hasConflict: boolean;
    detectedVins: Array<{ vin: string; fileName: string; docType?: string; chassisNo?: string }>;
    warningMessage?: string;
  } | null;
}

export const AutoSortReviewModal: React.FC<AutoSortReviewModalProps> = ({
  isOpen,
  onClose,
  matches,
  onUpdateMatch,
  onConfirm,
  isProcessing = false,
  vinConflict,
}) => {
  if (!isOpen) return null;

  const validMatches = matches.filter(m => m.target !== 'IGNORE');
  const matchedDocsCount = matches.filter(m => m.target !== 'IGNORE' && m.target !== 'PHOTOS' && m.target !== 'VIDEOS').length;
  const photoCount = matches.filter(m => m.target === 'PHOTOS').length;
  const videoCount = matches.filter(m => m.target === 'VIDEOS').length;
  const unmatchedCount = matches.filter(m => m.target === 'IGNORE').length;

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name)) {
      return <Film className="w-4 h-4 text-indigo-600 shrink-0" />;
    }
    if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      return <Images className="w-4 h-4 text-sky-600 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-emerald-600 shrink-0" />;
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-sky-50 via-indigo-50 to-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-600 text-white rounded-lg shadow-xs">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h4 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <span>AUTO-SORT & ATTACH DOCUMENTS</span>
                <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                  SMART MATCHER
                </span>
              </h4>
              <p className="text-xs text-slate-500">
                Review how your files were automatically matched to standard compliance slots
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Pill Summary Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{matchedDocsCount} Docs Auto-Matched</span>
            </span>

            {photoCount > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full">
                <Images className="w-3.5 h-3.5 text-sky-600" />
                <span>{photoCount} Photos</span>
              </span>
            )}

            {videoCount > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full">
                <Film className="w-3.5 h-3.5 text-indigo-600" />
                <span>{videoCount} Video{videoCount > 1 ? 's' : ''}</span>
              </span>
            )}

            {unmatchedCount > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>{unmatchedCount} Unassigned (Review below)</span>
              </span>
            )}
          </div>

          <span className="text-[11px] font-mono text-slate-500">
            Total: {matches.length} file{matches.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* VIN Conflict Warning Banner */}
        {vinConflict?.hasConflict && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2.5 text-amber-900 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">
                ⚠️ Mixed Vehicle Documents Detected!
              </p>
              <p className="text-amber-800">
                The files in this upload contain different VIN numbers. Please check that you haven't accidentally mixed documents from different cars:
              </p>
              <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded border border-amber-200">
                {vinConflict.detectedVins.map((d, i) => (
                  <li key={i}>
                    <span className="font-bold">{d.fileName}</span>
                    {d.docType ? ` [${d.docType}]` : ''}: VIN <span className="font-bold underline">{d.vin}</span>
                    {d.chassisNo ? ` (Chassis: ${d.chassisNo})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Matched Files List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-100">
          {matches.map(item => {
            const isUnmatched = item.target === 'IGNORE';
            return (
              <div
                key={item.id}
                className={`pt-2.5 first:pt-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border transition ${
                  isUnmatched
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-white hover:bg-slate-50/70 border-slate-200'
                }`}
              >
                {/* File Details */}
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="p-1.5 bg-slate-100 rounded shrink-0 mt-0.5">
                    {getFileIcon(item.file)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-900 truncate max-w-xs sm:max-w-sm" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <span className="text-[10px] font-mono text-slate-400">
                        ({formatBytes(item.file.size)})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <span className={item.confidence === 'high' ? 'text-emerald-700 font-medium' : item.confidence === 'medium' ? 'text-sky-700 font-medium' : 'text-amber-700 font-medium'}>
                        {item.confidence === 'high' && '✓ '}
                        {item.matchReason}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Assignment Dropdown & Target Badge */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden sm:block shrink-0" />

                  <select
                    value={item.target}
                    onChange={e => onUpdateMatch(item.id, e.target.value as AutoMatchTarget)}
                    disabled={isProcessing}
                    className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border focus:outline-hidden focus:ring-2 focus:ring-sky-500 transition cursor-pointer ${
                      isUnmatched
                        ? 'border-amber-300 bg-amber-50 text-amber-900 font-bold'
                        : 'border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    <optgroup label="8 Core Compliance Documents">
                      {CORE_DOC_SLOTS.map(slot => (
                        <option key={slot.type} value={slot.type}>
                          {slot.label} — {slot.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Vehicle Media">
                      <option value="PHOTOS">PHOTOS — Compliance Photos (Batch)</option>
                      <option value="VIDEOS">VIDEOS — Inspection Videos</option>
                    </optgroup>
                    <optgroup label="Skip">
                      <option value="IGNORE">-- Skip / Ignore this file --</option>
                    </optgroup>
                  </select>

                  {item.target !== 'IGNORE' && (
                    <button
                      type="button"
                      onClick={() => onUpdateMatch(item.id, 'IGNORE')}
                      disabled={isProcessing}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                      title="Skip this file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-slate-500 hidden sm:block">
            Files will be attached to slots and synced to Google Drive.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={validMatches.length === 0 || isProcessing}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Attaching & Syncing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Attach All Sorted Files ({validMatches.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
