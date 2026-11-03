import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  FileUp, 
  Sparkles, 
  MessageSquare,
  Search,
  ChevronRight,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import type { ComplianceJob, DocType } from '../types';
import { REQUIRED_DOC_TYPES } from '../types';

interface NotificationCenterProps {
  jobs: ComplianceJob[];
  onOpenJob: (job: ComplianceJob) => void;
  onRequestDocs?: (job: ComplianceJob) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
  jobs, 
  onOpenJob, 
  onRequestDocs 
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'missing' | 'complete'>('missing');
  const [searchFilter, setSearchFilter] = useState('');

  // Accurately compute completed vs missing based on attachments
  const { completedJobs, pendingJobs } = useMemo(() => {
    const completed: ComplianceJob[] = [];
    const pending: { job: ComplianceJob; missingDocs: DocType[]; uploadedCount: number }[] = [];

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

      const uploadedCount = attachedTypes.size;

      if (missing.length === 0) {
        completed.push(job);
      } else {
        pending.push({ job, missingDocs: missing, uploadedCount });
      }
    });

    return { completedJobs: completed, pendingJobs: pending };
  }, [jobs]);

  // Filtered lists for the drawer
  const filteredPending = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return pendingJobs;
    return pendingJobs.filter(({ job }) => 
      job.folder_no.toLowerCase().includes(q) ||
      job.vin.toLowerCase().includes(q) ||
      (job.raw_workshop_name && job.raw_workshop_name.toLowerCase().includes(q)) ||
      (job.raw_id && job.raw_id.toLowerCase().includes(q))
    );
  }, [pendingJobs, searchFilter]);

  const filteredCompleted = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return completedJobs;
    return completedJobs.filter(job => 
      job.folder_no.toLowerCase().includes(q) ||
      job.vin.toLowerCase().includes(q) ||
      (job.raw_workshop_name && job.raw_workshop_name.toLowerCase().includes(q))
    );
  }, [completedJobs, searchFilter]);

  const nearlyReadyCount = pendingJobs.filter(p => p.missingDocs.length <= 2).length;

  return (
    <>
      {/* Sleek, Compact Top Notification Bar (Replaces the huge cluttered card grid) */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs mb-5 overflow-hidden transition">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 sm:px-5 py-3 gap-3 bg-gradient-to-r from-slate-50 via-sky-50/30 to-amber-50/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-sky-100 text-sky-800 rounded-lg shrink-0 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-sm tracking-tight text-slate-900">
                  DOCUMENT READINESS ALERTS
                </span>
                {pendingJobs.length > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    {pendingJobs.length} Incomplete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    All 100% Ready
                  </span>
                )}
                {nearlyReadyCount > 0 && (
                  <span className="hidden md:inline-flex text-[11px] font-medium text-slate-500">
                    ({nearlyReadyCount} vehicle{nearlyReadyCount === 1 ? ' is' : 's are'} 1–2 docs away from AVV sign-off)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {pendingJobs.length > 0 
                  ? `${pendingJobs.length} vehicle(s) require document uploads before physical AVV verification.` 
                  : 'All incoming compliance jobs have complete verified documentation.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab('missing');
                setIsDrawerOpen(true);
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-300/80 rounded-md text-xs font-semibold shadow-2xs transition"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>Incomplete ({pendingJobs.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('complete');
                setIsDrawerOpen(true);
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-900 border border-emerald-300/80 rounded-md text-xs font-semibold shadow-2xs transition"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Ready ({completedJobs.length})</span>
            </button>

            <button
              onClick={() => setIsDrawerOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-md text-xs font-semibold shadow-2xs transition"
              title="Open full document readiness slide-over panel"
            >
              <span>Action Panel</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-Over Notification Drawer (Completely unblocks the main table) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop overlay */}
          <div 
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Drawer container */}
          <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-50 transform transition-transform duration-300 ease-out border-l border-slate-200">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-sky-100 text-sky-800 rounded-lg shrink-0 mt-0.5">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900">
                    DOCUMENT READINESS PANEL
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live tracking of document completeness for workshop clients
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
                title="Close Panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Tabs & Filter Search */}
            <div className="p-3.5 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <button
                  onClick={() => setActiveTab('missing')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    activeTab === 'missing'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  <span>Missing Documents ({pendingJobs.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('complete')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    activeTab === 'complete'
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Ready for AVV ({completedJobs.length})</span>
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Filter by Folder, VIN, or Workshop..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Drawer Body List (Streamlined, compact cards) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
              {activeTab === 'missing' ? (
                filteredPending.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                    <p className="font-semibold text-slate-700 text-sm">No pending document requests</p>
                    <p className="text-xs mt-1">All vehicles currently have complete compliance files.</p>
                  </div>
                ) : (
                  filteredPending.map(({ job, missingDocs, uploadedCount }) => {
                    const percent = Math.round((uploadedCount / 8) * 100);
                    return (
                      <div
                        key={job.id}
                        className="bg-white border border-slate-200/90 hover:border-amber-400 rounded-lg p-3.5 shadow-2xs transition group"
                      >
                        {/* Header: Folder, Workshop, Progress */}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-sky-700 transition">
                              {job.folder_no}
                            </span>
                            <span className="text-slate-400 mx-1.5">•</span>
                            <span className="text-xs font-semibold text-slate-800">
                              {job.raw_workshop_name || job.raw_id || 'Client Workshop'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                              uploadedCount >= 7 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-amber-100 text-amber-900'
                            }`}>
                              {uploadedCount}/8 Docs ({percent}%)
                            </span>
                          </div>
                        </div>

                        {/* Vehicle details */}
                        <div className="text-xs text-slate-600 mb-2 font-mono flex items-center justify-between">
                          <span>VIN: <b className="text-slate-800">{job.vin}</b></span>
                          <span className="text-slate-500 font-sans">{[job.make, job.model].filter(Boolean).join(' ') || 'Vehicle'}</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              uploadedCount >= 7 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        {/* ONLY DYNAMICALLY SHOW MISSING DOCS (Not all 8!) */}
                        <div className="mb-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                            Missing ({missingDocs.length}):
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {missingDocs.map(doc => (
                              <span
                                key={doc}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-50 text-red-700 border border-red-200"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-red-500" />
                                {doc}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Card Actions */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          {onRequestDocs && (
                            <button
                              type="button"
                              onClick={() => {
                                onRequestDocs(job);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-2xs transition"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Request Missing Docs</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setIsDrawerOpen(false);
                              onOpenJob(job);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition"
                          >
                            <FileUp className="w-3 h-3 text-slate-500" />
                            <span>Upload Files</span>
                            <ChevronRight className="w-3 h-3 text-slate-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                filteredCompleted.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2 opacity-80" />
                    <p className="font-semibold text-slate-700 text-sm">No vehicles fully completed yet</p>
                    <p className="text-xs mt-1">Once all 8 documents are attached for a vehicle, it will appear here.</p>
                  </div>
                ) : (
                  filteredCompleted.map(job => (
                    <div
                      key={job.id}
                      onClick={() => {
                        setIsDrawerOpen(false);
                        onOpenJob(job);
                      }}
                      className="bg-white border border-emerald-200 hover:border-emerald-400 rounded-lg p-3.5 shadow-2xs transition cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-emerald-700 transition">
                          {job.folder_no}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Complete (8/8)
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-slate-800 mb-1">
                        {job.raw_workshop_name || job.raw_id || 'Workshop'}
                      </div>

                      <div className="text-xs text-slate-600 mb-2 font-mono">
                        VIN: {job.vin}
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
                        <span>{job.make} {job.model}</span>
                        <span className="font-semibold text-emerald-700 text-xs group-hover:underline">
                          View Verification Sign-off →
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
