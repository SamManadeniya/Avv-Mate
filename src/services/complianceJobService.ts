import { supabase } from '../lib/supabase';
import type { ComplianceJob, DocType, JobAttachment } from '../types';
import { attachmentService } from './attachmentService';

export const complianceJobService = {
  async getAll(): Promise<ComplianceJob[]> {
    // Attempt detailed view first
    const { data: viewData, error: viewError } = await supabase
      .from('v_compliance_jobs_detailed')
      .select('*')
      .order('created_at', { ascending: false });

    if (!viewError && viewData) {
      return (viewData as any[]).map(row => ({
        id: row.job_id,
        folder_no: row.folder_no,
        vin: row.vin,
        raw_id: row.raw_id,
        raw_workshop_name: row.raw_workshop_name,
        mre_no: row.mre_no,
        make: row.make,
        model: row.model,
        build_date: row.build_date,
        via_no: row.via_no,
        request_received: row.request_received,
        videos_url: row.videos_url,
        avv_verification_date: row.avv_verification_date,
        rav_date_of_entry: row.rav_date_of_entry,
        status: row.status,
        error_note: row.error_note,
        supersedes_folder_no: row.supersedes_folder_no,
        created_at: row.created_at,
        updated_at: row.updated_at,
        uploaded_docs_count: row.uploaded_docs_count || 0,
        is_documents_complete: row.is_documents_complete || false,
      }));
    }

    // Fallback: standard query with joins
    const { data, error } = await supabase
      .from('compliance_jobs')
      .select(`
        *,
        vehicles ( build_date, via_no ),
        raw_workshops ( name ),
        model_reports ( make, model ),
        job_attachments ( id, doc_type, file_url, file_name, file_size, mime_type, uploaded_at )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => {
      const attachmentsMap: Record<DocType, JobAttachment | null> = {
        CRE: null, EC: null, CIN: null, WI: null,
        DC: null, VI: null, RAW_DECLA: null, PHOTOS: null
      };
      let docCount = 0;
      if (Array.isArray(row.job_attachments)) {
        row.job_attachments.forEach((att: any) => {
          if (att.doc_type in attachmentsMap) {
            attachmentsMap[att.doc_type as DocType] = att;
            docCount++;
          }
        });
      }

      return {
        id: row.id,
        folder_no: row.folder_no,
        vin: row.vin,
        raw_id: row.raw_id,
        raw_workshop_name: row.raw_workshops?.name || null,
        mre_no: row.mre_no,
        make: row.model_reports?.make || null,
        model: row.model_reports?.model || null,
        build_date: row.vehicles?.build_date || null,
        via_no: row.vehicles?.via_no || null,
        request_received: row.request_received,
        videos_url: row.videos_url,
        avv_verification_date: row.avv_verification_date,
        rav_date_of_entry: row.rav_date_of_entry,
        status: row.status,
        error_note: row.error_note,
        supersedes_folder_no: row.supersedes_folder_no,
        created_at: row.created_at,
        updated_at: row.updated_at,
        attachments: attachmentsMap,
        uploaded_docs_count: docCount,
        is_documents_complete: docCount === 8,
      };
    });
  },

  async getById(id: string): Promise<ComplianceJob | null> {
    const { data, error } = await supabase
      .from('compliance_jobs')
      .select(`
        *,
        vehicles ( build_date, via_no ),
        raw_workshops ( name ),
        model_reports ( make, model )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row: any = data;
    const attachments = await attachmentService.getByJobId(id);
    const docCount = Object.values(attachments).filter(Boolean).length;

    return {
      id: row.id,
      folder_no: row.folder_no,
      vin: row.vin,
      raw_id: row.raw_id,
      raw_workshop_name: row.raw_workshops?.name || null,
      mre_no: row.mre_no,
      make: row.model_reports?.make || null,
      model: row.model_reports?.model || null,
      build_date: row.vehicles?.build_date || null,
      via_no: row.vehicles?.via_no || null,
      request_received: row.request_received,
      videos_url: row.videos_url,
      avv_verification_date: row.avv_verification_date,
      rav_date_of_entry: row.rav_date_of_entry,
      status: row.status,
      error_note: row.error_note,
      supersedes_folder_no: row.supersedes_folder_no,
      created_at: row.created_at,
      updated_at: row.updated_at,
      attachments,
      uploaded_docs_count: docCount,
      is_documents_complete: docCount === 8,
    };
  },

  async create(job: Partial<ComplianceJob>): Promise<ComplianceJob> {
    const { data, error } = await supabase
      .from('compliance_jobs')
      .insert([{
        folder_no: job.folder_no?.toUpperCase().trim(),
        vin: job.vin?.toUpperCase().trim(),
        raw_id: job.raw_id || null,
        mre_no: job.mre_no || null,
        request_received: job.request_received || new Date().toISOString().slice(0, 10),
        videos_url: job.videos_url?.trim() || null,
        avv_verification_date: job.avv_verification_date || null,
        rav_date_of_entry: job.rav_date_of_entry || null,
        status: job.status || 'in_progress',
        error_note: job.error_note?.trim() || null,
        supersedes_folder_no: job.supersedes_folder_no || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<ComplianceJob>;
  },

  async update(id: string, updates: Partial<ComplianceJob>): Promise<ComplianceJob> {
    const { error } = await supabase
      .from('compliance_jobs')
      .update({
        raw_id: updates.raw_id || null,
        mre_no: updates.mre_no || null,
        request_received: updates.request_received,
        videos_url: updates.videos_url?.trim() || null,
        avv_verification_date: updates.avv_verification_date || null,
        rav_date_of_entry: updates.rav_date_of_entry || null,
        status: updates.status,
        error_note: updates.error_note?.trim() || null,
        supersedes_folder_no: updates.supersedes_folder_no || null,
      })
      .eq('id', id);

    if (error) throw error;
    return this.getById(id) as Promise<ComplianceJob>;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('compliance_jobs')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getLastFolderNo(): Promise<string | null> {
    const { data } = await supabase
      .from('compliance_jobs')
      .select('folder_no')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.folder_no || null;
  }
};

