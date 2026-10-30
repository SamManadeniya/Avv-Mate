import { supabase } from '../lib/supabase';
import type { DocType, JobAttachment } from '../types';

export const attachmentService = {
  async getByJobId(jobId: string): Promise<Record<DocType, JobAttachment | null>> {
    const { data, error } = await supabase
      .from('job_attachments')
      .select('*')
      .eq('job_id', jobId);

    if (error) {
      console.warn('Error fetching attachments:', error);
      return {
        CRE: null, EC: null, CIN: null, WI: null,
        DC: null, VI: null, RAW_DECLA: null, PHOTOS: null
      };
    }

    const map: Record<DocType, JobAttachment | null> = {
      CRE: null, EC: null, CIN: null, WI: null,
      DC: null, VI: null, RAW_DECLA: null, PHOTOS: null
    };

    (data || []).forEach((att: any) => {
      if (att.doc_type in map) {
        map[att.doc_type as DocType] = att as JobAttachment;
      }
    });

    return map;
  },

  async uploadFile(jobId: string, docType: DocType, file: File): Promise<JobAttachment> {
    const fileExt = file.name.split('.').pop() || 'bin';
    const filePath = `jobs/${jobId}/${docType}_${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage bucket 'compliance-docs'
    const { error: uploadError } = await supabase.storage
      .from('compliance-docs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    let publicUrl = '';
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('compliance-docs')
        .getPublicUrl(filePath);
      publicUrl = urlData.publicUrl;
    } else {
      console.warn('Storage upload error (fallback to local object URL or record):', uploadError);
      publicUrl = URL.createObjectURL(file);
    }

    // Upsert into public.job_attachments
    const { data, error: dbError } = await supabase
      .from('job_attachments')
      .upsert({
        job_id: jobId,
        doc_type: docType,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        uploaded_at: new Date().toISOString()
      }, {
        onConflict: 'job_id,doc_type'
      })
      .select()
      .single();

    if (dbError) throw dbError;
    return data as JobAttachment;
  },

  async deleteAttachment(jobId: string, docType: DocType, fileUrl?: string): Promise<void> {
    if (fileUrl && fileUrl.includes('compliance-docs')) {
      const path = fileUrl.split('compliance-docs/')[1];
      if (path) {
        await supabase.storage.from('compliance-docs').remove([path]);
      }
    }

    const { error } = await supabase
      .from('job_attachments')
      .delete()
      .eq('job_id', jobId)
      .eq('doc_type', docType);

    if (error) throw error;
  }
};

