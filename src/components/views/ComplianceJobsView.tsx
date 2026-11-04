import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Download, 
  FileText, 
  Edit3, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Video, 
  CheckCircle2, 
  MessageSquare,
  ExternalLink,
  Receipt
} from 'lucide-react';
import type { ComplianceJob } from '../../types';
import { REQUIRED_DOC_TYPES } from '../../types';
import { formatDate } from '../../lib/utils';
import { exportService } from '../../services/exportService';

interface ComplianceJobsViewProps {
  jobs: ComplianceJob[];
  onNewJob: () => void;
  onEditJob: (job: ComplianceJob) => void;
  onDeleteJob: (job: ComplianceJob) => void;
  onRequestDocs?: (job: ComplianceJob) => void;
  onGenerateInvoice?: (job: ComplianceJob) => void;
}

export const ComplianceJobsView: React.FC<ComplianceJobsViewProps> = ({
  jobs,
  onNewJob,
  onEditJob,
  onDeleteJob,
  onRequestDocs,
  onGenerateInvoice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [docFilter, setDocFilter] = useState<string>('all');

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const q = searchTerm.toLowerCase().trim();
      const matchQuery = 
        !q ||
        job.folder_no.toLowerCase().includes(q) ||
        job.vin.toLowerCase().includes(q) ||
        (job.raw_id && job.raw_id.toLowerCase().includes(q)) ||
        (job.raw_workshop_name && job.raw_workshop_name.toLowerCase().includes(q)) ||
        (job.mre_no && job.mre_no.toLowerCase().includes(q)) ||
        (job.make && job.make.toLowerCase().includes(q)) ||
        (job.model && job.model.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'all' || job.status === statusFilter;

      let matchDoc = true;
      if (docFilter === 'complete') {
        matchDoc = (job.uploaded_docs_count || 0) >= 8;
      } else if (docFilter === 'incomplete') {
        matchDoc = (job.uploaded_docs_count || 0) < 8;
      }

      return matchQuery && matchStatus && matchDoc;
    });
  }, [jobs, searchTerm, statusFilter, docFilter]);

  const handleExportCsv = () => {
    const exportData = filteredJobs.map(j => ({
      'Folder No': j.folder_no,
      'VIN': j.vin,
      'RAW ID': j.raw_id || '',
      'Workshop Name': j.raw_workshop_name || '',
      'MRE No': j.mre_no || '',
      'Make': j.make || '',
      'Model': j.model || '',
      'Request Received': j.request_received,
      'AVV Verification Date': j.avv_verification_date || '',
      'AVV Submit Date': j.avv_submit_date || '',
      'RAV Date of Entry': j.rav_date_of_entry || '',
      'Approval Date': j.approval_date || '',
      'Recall Check Date': j.recall_check_date || '',
      'Status': j.status,
      'Documents Uploaded': `${j.uploaded_docs_count || 0}/9`,
      'Videos Link': j.videos_url || '',
    }));
    exportService.exportToCsv('compliance_jobs', exportData);
  };

  const handleExportPdf = () => {
    exportService.exportJobsPdf(filteredJobs);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Header & Controls Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 tracking-tight">
              COMPLIANCE VERIFICATION PIPELINE
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 font-mono font-semibold text-slate-700">
              {filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational dashboard tracking incoming requests, certificate attachments, video evidence, and RAV entry milestones
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
            onClick={onNewJob}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Compliance Job</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 sm:p-3.5 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between text-xs">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by VIN, Folder, Workshop, Make, or MRE..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-initial px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">All Statuses</option>
            <option value="in_progress">🟡 In Progress</option>
            <option value="verified">🔵 Verified by AVV</option>
            <option value="rav_entered">🟢 RAV Entered</option>
            <option value="errored">🔴 Errored</option>
          </select>

          {/* Document completeness filter */}
          <select
            value={docFilter}
            onChange={e => setDocFilter(e.target.value)}
            className="flex-1 sm:flex-initial px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">All Document States</option>
            <option value="complete">🟢 Complete (9/9 Docs)</option>
            <option value="incomplete">⚠️ Incomplete (Pending Docs)</option>
          </select>
        </div>
      </div>

      {/* Mobile swipe helper */}
      <div className="md:hidden px-4 py-1.5 bg-sky-50/70 border-b border-sky-100 text-[11px] text-sky-800 flex items-center justify-between font-medium">
        <span>👉 Swipe table to view all 9 documents & dates</span>
        <span className="font-semibold text-sky-900 bg-sky-100 px-1.5 py-0.5 rounded text-[10px]">Actions pinned</span>
      </div>

      {/* Spreadsheet / Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 font-display uppercase tracking-wider text-slate-600 text-[11px]">
              <th className="py-2.5 px-3 font-bold">Folder #</th>
              <th className="py-2.5 px-3 font-bold bg-amber-50/50">VIN</th>
              <th className="py-2.5 px-3 font-bold bg-red-50/50">RAW ID</th>
              <th className="py-2.5 px-3 font-bold bg-red-50/30">MRE</th>
              <th className="py-2.5 px-3 font-bold bg-sky-50/50">Request Received</th>

              {/* 9 Document Attachment Columns */}
              {REQUIRED_DOC_TYPES.map(doc => (
                <th key={doc.type} className="py-2.5 px-2 font-bold text-center bg-slate-100" title={doc.name}>
                  {doc.label}
                </th>
              ))}

              <th className="py-2.5 px-3 font-bold text-center">Videos</th>
              <th className="py-2.5 px-3 font-bold">AVV Verification</th>
              <th className="py-2.5 px-3 font-bold">AVV Submit</th>
              <th className="py-2.5 px-3 font-bold">RAV Entry</th>
              <th className="py-2.5 px-3 font-bold">Approval Date</th>
              <th className="py-2.5 px-3 font-bold">Recall Check</th>
              <th className="py-2.5 px-3 font-bold">Status</th>
              <th className="py-2.5 px-3 font-bold text-right sticky right-0 bg-slate-100 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={23} className="py-12 text-center text-slate-400">
                  <p className="font-semibold text-sm">No compliance jobs found</p>
                  <p className="text-xs mt-1">Try adjusting your filters or click "New Compliance Job" to add one.</p>
                </td>
              </tr>
            ) : (
              filteredJobs.map(job => {
                return (
                  <tr 
                    key={job.id} 
                    className="hover:bg-sky-50/40 transition group cursor-pointer"
                    onClick={() => onEditJob(job)}
                  >
                    {/* Folder # */}
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {(() => {
                        const targetUrl = (job.folder_url && job.folder_url.startsWith('https://drive.google.com/drive/folders/') && !job.folder_url.endsWith('12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5'))
                          ? job.folder_url
                          : `https://drive.google.com/drive/search?q=${encodeURIComponent(job.folder_no)}`;
                        return (
                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sky-800 hover:text-sky-950 hover:underline"
                            title={`Open ${job.folder_no} vehicle folder on Google Drive`}
                          >
                            <span>{job.folder_no}</span>
                            <ExternalLink className="w-3 h-3 text-sky-600" />
                          </a>
                        );
                      })()}
                    </td>

                    {/* VIN */}
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 bg-amber-50/30 whitespace-nowrap">
                      {job.vin}
                    </td>

                    {/* RAW ID */}
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-800 bg-red-50/30 whitespace-nowrap">
                      <span title={job.raw_workshop_name || ''}>
                        {job.raw_id || '—'}
                      </span>
                    </td>

                    {/* MRE */}
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-800 bg-red-50/20 whitespace-nowrap">
                      <span title={`${job.make || ''} ${job.model || ''}`}>
                        {job.mre_no || '—'}
                      </span>
                    </td>

                    {/* Request Received */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 bg-sky-50/30 whitespace-nowrap">
                      {formatDate(job.request_received)}
                    </td>

                    {/* 9 Document Attachment slots */}
                    {REQUIRED_DOC_TYPES.map(doc => {
                      const att = job.attachments?.[doc.type];
                      const safeDocUrl = (att?.file_url && att.file_url.startsWith('https://drive.google.com') && !att.file_url.endsWith('12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5'))
                        ? att.file_url
                        : (att?.file_url && !att.file_url.startsWith('blob:'))
                          ? att.file_url
                          : (doc.type === 'PHOTOS')
                            ? `https://drive.google.com/drive/search?q=${encodeURIComponent(job.folder_no + ' PHOTOS')}`
                            : `https://drive.google.com/drive/search?q=${encodeURIComponent(job.folder_no + ' ' + doc.type)}`;
                      return (
                        <td key={doc.type} className="py-2 px-1 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          {att ? (
                            <a
                              href={safeDocUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`${doc.name}: ${att.file_name} (Click to open on Google Drive)`}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition font-mono font-bold text-[10px]"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <button
                              onClick={() => onEditJob(job)}
                              title={`Missing ${doc.label}: Click to upload`}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-800 transition font-mono text-[10px]"
                            >
                              +
                            </button>
                          )}
                        </td>
                      );
                    })}

                    {/* Videos (Google Drive link) */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {job.videos_url ? (
                        <a
                          href={job.videos_url.endsWith('12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5') ? `https://drive.google.com/drive/search?q=${encodeURIComponent(job.folder_no + ' VIDEOS')}` : job.videos_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${job.folder_no} inspection videos on Google Drive`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded border border-sky-200 transition"
                        >
                          <Video className="w-3.5 h-3.5 text-sky-700" />
                          <span>Drive</span>
                        </a>
                      ) : (
                        <a
                          href={`https://drive.google.com/drive/search?q=${encodeURIComponent(job.folder_no + ' VIDEOS')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${job.folder_no} video folder on Google Drive`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-sky-700 transition"
                        >
                          <Video className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px]">+</span>
                        </a>
                      )}
                    </td>

                    {/* AVV Verification Date */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(job.avv_verification_date)}
                    </td>

                    {/* AVV Submit Date */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(job.avv_submit_date)}
                    </td>

                    {/* RAV Date of Entry */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(job.rav_date_of_entry)}
                    </td>

                    {/* Approval Payment Date */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(job.approval_date)}
                    </td>

                    {/* Recall Check Date */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(job.recall_check_date)}
                    </td>

                    {/* Status Pill */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {job.status === 'rav_entered' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> RAV Entered
                        </span>
                      ) : job.status === 'verified' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800">
                          <Check className="w-3 h-3 text-sky-600" /> Verified
                        </span>
                      ) : job.status === 'errored' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">
                          <AlertTriangle className="w-3 h-3 text-red-600" /> Errored
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                          🟡 In Progress ({job.uploaded_docs_count || 0}/9)
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td 
                      className="py-2.5 px-3 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-sky-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]" 
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {onGenerateInvoice && (
                          <button
                            onClick={() => onGenerateInvoice(job)}
                            className="p-1.5 text-teal-700 hover:text-teal-900 hover:bg-teal-50 rounded transition"
                            title="Generate Model Reports Online Tax Invoice"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                        )}
                        {(job.uploaded_docs_count || 0) < 9 && onRequestDocs && (
                          <button
                            onClick={() => onRequestDocs(job)}
                            className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded transition"
                            title="Request Missing Documents via WhatsApp / Email"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => onEditJob(job)}
                          className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-100 rounded transition"
                          title="Edit Job"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteJob(job)}
                          className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-100 rounded transition"
                          title="Delete Job"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
