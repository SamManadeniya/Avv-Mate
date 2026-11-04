import type { DocType, JobAttachment } from '../types';
import { googleSheetsService } from './googleSheetsService';

export const attachmentService = {
  async getByJobId(jobId: string): Promise<Record<DocType, JobAttachment | null>> {
    const cached = googleSheetsService.getCachedMasterData();
    const job = cached?.jobs?.find(j => j.id === jobId || j.folder_no === jobId);

    const map: Record<DocType, JobAttachment | null> = {
      CRE: null, EC: null, CIN: null, WI: null,
      DC: null, VI: null, RAW_DECLA: null, RECALL: null, PHOTOS: null
    };

    if (job?.attachments) {
      Object.entries(job.attachments).forEach(([k, v]) => {
        if (k in map && v) {
          map[k as DocType] = v as JobAttachment;
        }
      });
    }

    return map;
  },

  async uploadFile(jobId: string, docType: DocType, file: File): Promise<JobAttachment> {
    const publicUrl = URL.createObjectURL(file);
    return {
      id: `att_${jobId}_${docType}_${Date.now()}`,
      job_id: jobId,
      doc_type: docType,
      file_url: publicUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      uploaded_at: new Date().toISOString()
    };
  },

  async deleteAttachment(_jobId: string, _docType: DocType, _fileUrl?: string): Promise<void> {
    // Attachments are synced via Google Drive & Google Sheets
    return Promise.resolve();
  }
};
