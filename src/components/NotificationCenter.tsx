import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, FileUp, Sparkles, MessageSquare } from 'lucide-react';
import type { ComplianceJob, DocType } from '../types';
import { REQUIRED_DOC_TYPES } from '../types';

interface NotificationCenterProps {
  jobs: ComplianceJob[];
  onOpenJob: (job: ComplianceJob) => void;
  onRequestDocs?: (job: ComplianceJob) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ jobs, onOpenJob, onRequestDocs }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'missing' | 'complete'>('missing');

  // Compute completed vs missing
  const completedJobs: ComplianceJob[] = [];
  const pendingJobs: { job: ComplianceJob; missingDocs: DocType[] }[] = [];

  jobs.forEach(job => {
    const attachedTypes = new Set<DocType>();
    if (job.attachments) {
      Object.entries(job.attachments).forEach(([type, att]) => {
        if (att) attachedTypes.add(type as DocType);
      });
    }

    const missing = REQUIRED_DOC_TYPES
      .map(d => d.type)
      .filter(type => !attachedTypes.has(type));

    if (missing.length === 0) {
      completedJobs.push(job);
    } else {
      pendingJobs.push({ job, missingDocs: missing });
    }
  });

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-6 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-sky-100 text-sky-700 rounded-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight font-display">
              DOCUMENT READINESS & CLIENT NOTIFICATION CENTER
            </h2>
            <p className="text-xs text-slate-500">
              Live tracking of document compliance across workshops and incoming vehicles
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Stats Badges */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActiveTab('missing'); setIsExpanded(true); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                activeTab === 'missing' && isExpanded
                  ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-amber-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{pendingJobs.length} Incomplete</span>
            </button>

            <button
              onClick={() => { setActiveTab('complete'); setIsExpanded(true); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                activeTab === 'complete' && isExpanded
                  ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{completedJobs.length} Ready for AVV</span>
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 bg-white">
          {activeTab === 'missing' ? (
            <div>
              <div className="flex items-center justify-between mb-3 text-xs text-slate-500 font-medium">
                <span>
                  Showing <b>{pendingJobs.length}</b> vehicles requiring missing document uploads:
                </span>
                <span className="text-slate-400">Click any vehicle to upload missing files directly</span>
              </div>

              {pendingJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-slate-700">All clients and vehicles are 100% complete!</p>
                  <p className="text-xs">No pending files or certificates required at this time.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pendingJobs.map(({ job, missingDocs }) => (
                    <div
                      key={job.id}
                      onClick={() => onOpenJob(job)}
                      className="border border-amber-200/80 bg-amber-50/40 hover:bg-amber-50/80 hover:border-amber-400 rounded-lg p-3.5 transition cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-sky-700 transition">
                              {job.folder_no}
                            </span>
                            <span className="text-slate-400 mx-1.5">•</span>
                            <span className="text-xs font-semibold text-slate-700">
                              {job.raw_workshop_name || job.raw_id || 'Unknown Workshop'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono px-1.5 py-0.5 bg-amber-200/60 text-amber-900 rounded font-semibold">
                            {8 - missingDocs.length}/8 Docs
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 mb-2 font-mono truncate">
                          VIN: <span className="text-slate-900 font-semibold">{job.vin}</span>
                        </div>

                        {/* Missing files pills */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {missingDocs.map(doc => (
                            <span
                              key={doc}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-100 text-red-700 border border-red-200"
                            >
                              Missing {doc}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between text-xs text-amber-800">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onRequestDocs) onRequestDocs(job);
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded transition text-[11px]"
                        >
                          <MessageSquare className="w-3 h-3 text-emerald-700" />
                          <span>Request Docs</span>
                        </button>
                        <span className="inline-flex items-center gap-1 font-semibold group-hover:underline text-sky-700 text-[11px]">
                          <FileUp className="w-3 h-3" /> Upload Files
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3 text-xs text-slate-500 font-medium">
                <span>
                  Showing <b>{completedJobs.length}</b> vehicles with all 8/8 compliance documents verified:
                </span>
                <span className="text-emerald-700 font-semibold">Ready for AVV physical inspection sign-off</span>
              </div>

              {completedJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-slate-700">No vehicles have all documents attached yet.</p>
                  <p className="text-xs">Once all 8 documents are uploaded for a job, it appears here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {completedJobs.map(job => (
                    <div
                      key={job.id}
                      onClick={() => onOpenJob(job)}
                      className="border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/80 hover:border-emerald-400 rounded-lg p-3.5 transition cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-emerald-700 transition">
                            {job.folder_no}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Complete
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-slate-800 mb-1">
                          {job.raw_workshop_name || job.raw_id || 'Workshop'}
                        </div>

                        <div className="text-xs text-slate-600 mb-2 font-mono">
                          VIN: {job.vin}
                        </div>

                        <div className="text-[11px] text-slate-500">
                          {job.make} {job.model} • AVV Date: {job.avv_verification_date || 'Pending'}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs text-emerald-800">
                        <span className="text-[11px] text-slate-500">
                          RAV: {job.rav_date_of_entry || 'Pending'}
                        </span>
                        <span className="font-semibold text-emerald-700 text-[11px] group-hover:underline">
                          View Compliance File →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
