import type { ComplianceJob, DocType, JobAttachment } from '../types';
import { googleSheetsService } from './googleSheetsService';
import { DEFAULT_COMPLIANCE_JOBS } from '../data/seedData';

export const complianceJobService = {
  async getAll(): Promise<ComplianceJob[]> {
    const cached = googleSheetsService.getCachedMasterData();
    if (cached?.jobs && cached.jobs.length > 0) {
      return cached.jobs;
    }
    return DEFAULT_COMPLIANCE_JOBS;
  },

  async getById(id: string): Promise<ComplianceJob | null> {
    const jobs = await this.getAll();
    const cleanId = id.toUpperCase().trim();
    const found = jobs.find(j => j.id === id || j.folder_no.toUpperCase() === cleanId || j.vin.toUpperCase() === cleanId);
    return found || null;
  },

  async create(job: Partial<ComplianceJob>, skipSheetSync = false): Promise<ComplianceJob> {
    const currentJobs = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const emptyAttachments: Record<DocType, JobAttachment | null> = {
      CRE: null, EC: null, CIN: null, WI: null,
      DC: null, VI: null, RAW_DECLA: null, RECALL: null, PHOTOS: null
    };

    const newJob: ComplianceJob = {
      id: job.id || `job_sheet_${job.folder_no || Date.now()}`,
      folder_no: (job.folder_no || `SVC${Date.now().toString().slice(-4)}`).toUpperCase().trim(),
      vin: (job.vin || '').toUpperCase().trim(),
      raw_id: job.raw_id ? job.raw_id.toUpperCase().trim() : null,
      raw_workshop_name: job.raw_workshop_name || null,
      mre_no: job.mre_no ? job.mre_no.toUpperCase().trim() : null,
      make: job.make || null,
      model: job.model || null,
      build_date: job.build_date || null,
      via_no: job.via_no || null,
      request_received: job.request_received || new Date().toISOString().slice(0, 10),
      videos_url: job.videos_url?.trim() || null,
      folder_url: job.folder_url?.trim() || null,
      avv_verification_date: job.avv_verification_date || null,
      avv_submit_date: job.avv_submit_date || null,
      rav_date_of_entry: job.rav_date_of_entry || null,
      approval_date: job.approval_date || null,
      recall_check_date: job.recall_check_date || null,
      status: job.status || 'in_progress',
      error_note: job.error_note?.trim() || null,
      supersedes_folder_no: job.supersedes_folder_no || null,
      created_at: job.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachments: { ...emptyAttachments, ...(job.attachments || {}) },
      uploaded_docs_count: job.uploaded_docs_count || Object.values(job.attachments || {}).filter(Boolean).length,
      is_documents_complete: Boolean(job.is_documents_complete),
    };

    const updatedJobs = [newJob, ...currentJobs.filter(j => j.folder_no !== newJob.folder_no && j.id !== newJob.id)];

    googleSheetsService.setCachedMasterData({
      jobs: updatedJobs,
      vehicles: cached?.vehicles || [],
      workshops: cached?.workshops || [],
      modelReports: cached?.modelReports || [],
    });

    if (!skipSheetSync && googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        updatedJobs,
        cached?.vehicles || [],
        cached?.workshops || [],
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return newJob;
  },

  async update(id: string, updates: Partial<ComplianceJob>, skipSheetSync = false): Promise<ComplianceJob> {
    const currentJobs = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const idx = currentJobs.findIndex(j => j.id === id || j.folder_no === id);
    if (idx === -1) {
      throw new Error(`Compliance Job with id ${id} not found.`);
    }

    const existing = currentJobs[idx];
    const updatedJob: ComplianceJob = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const updatedJobs = [...currentJobs];
    updatedJobs[idx] = updatedJob;

    googleSheetsService.setCachedMasterData({
      jobs: updatedJobs,
      vehicles: cached?.vehicles || [],
      workshops: cached?.workshops || [],
      modelReports: cached?.modelReports || [],
    });

    if (!skipSheetSync && googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        updatedJobs,
        cached?.vehicles || [],
        cached?.workshops || [],
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return updatedJob;
  },

  async delete(id: string): Promise<void> {
    const currentJobs = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const updatedJobs = currentJobs.filter(j => j.id !== id && j.folder_no !== id);

    googleSheetsService.setCachedMasterData({
      jobs: updatedJobs,
      vehicles: cached?.vehicles || [],
      workshops: cached?.workshops || [],
      modelReports: cached?.modelReports || [],
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        updatedJobs,
        cached?.vehicles || [],
        cached?.workshops || [],
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }
  },

  async getLastFolderNo(): Promise<string | null> {
    const jobs = await this.getAll();
    if (jobs.length === 0) return null;
    return jobs[0].folder_no;
  }
};
