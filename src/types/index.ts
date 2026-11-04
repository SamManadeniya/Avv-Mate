export type DocType = 'CRE' | 'EC' | 'CIN' | 'WI' | 'DC' | 'VI' | 'RAW_DECLA' | 'RECALL' | 'PHOTOS';

export interface DocDefinition {
  type: DocType;
  label: string;
  name: string;
  description: string;
}

export const REQUIRED_DOC_TYPES: DocDefinition[] = [
  { type: 'CRE', label: 'CRE', name: 'Concessional RAV Entry', description: 'Import Approval / Concessional Entry' },
  { type: 'EC', label: 'EC', name: 'Export Certificate', description: 'Origin Country Export / De-registration' },
  { type: 'CIN', label: 'CIN', name: 'Import Notice', description: 'Consumer Import Notice / Approval' },
  { type: 'WI', label: 'WI', name: 'Work Instructions', description: 'Model Report Modification & Inspection Guide' },
  { type: 'DC', label: 'DC', name: 'Deregistration Cert', description: 'De-registration Certificate' },
  { type: 'VI', label: 'VI', name: 'Vehicle Inspection', description: 'AVV / RAW Physical Inspection Checklist' },
  { type: 'RAW_DECLA', label: 'RAW DECLA', name: 'RAW Declaration', description: 'Signed Workshop Compliance Declaration' },
  { type: 'RECALL', label: 'RECALL', name: 'Recall Check', description: 'Recall Clearance / Status Check Document' },
  { type: 'PHOTOS', label: 'PHOTOS', name: 'Compliance Photos', description: 'Photographic Evidence (Labels, Odometer, Modifications)' },
];

export interface RawWorkshop {
  raw_id: string; // PK e.g. RAW-000153
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  total_vehicles?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ModelReport {
  mre_no: string; // PK e.g. MRE-000008
  unique_id?: string | null; // Model Report Unique ID
  build_from?: string | null;
  build_to?: string | null;
  sev_no?: string | null;
  sev_build_from?: string | null;
  sev_build_to?: string | null;
  make: string;
  model: string;
  vcc?: string | null; // MA, MB, MC, NA, etc.
  tare_kg?: number | null;
  power_kw?: number | null;
  seats?: number | null;
  author?: string | null; // Author / Supplier
  created_at?: string;
  updated_at?: string;
}

export interface Vehicle {
  vin: string; // PK (17 chars)
  build_date: string; // e.g. 07/2020 or 2020-07
  via_no?: string | null; // e.g. CRE-145420
  raw_id?: string | null;
  raw_workshop_name?: string | null; // populated via join
  mre_no?: string | null;
  make?: string | null; // from MRE
  model?: string | null; // from MRE
  created_at?: string;
  updated_at?: string;
}

export type JobStatus = 'in_progress' | 'verified' | 'rav_entered' | 'errored';

export interface JobAttachment {
  id?: string;
  job_id: string;
  doc_type: DocType;
  file_url: string;
  file_name: string;
  file_size?: number | null;
  mime_type?: string | null;
  uploaded_at?: string;
}

export interface ComplianceJob {
  id: string; // UUID
  folder_no: string; // SVC1040
  vin: string;
  raw_id?: string | null;
  raw_workshop_name?: string | null;
  mre_no?: string | null;
  make?: string | null;
  model?: string | null;
  build_date?: string | null;
  via_no?: string | null;
  request_received: string; // YYYY-MM-DD
  videos_url?: string | null; // Google Drive link
  folder_url?: string | null; // Direct Google Drive folder URL
  avv_verification_date?: string | null;
  avv_submit_date?: string | null;
  rav_date_of_entry?: string | null;
  approval_date?: string | null; // Approval Payment Date
  recall_check_date?: string | null;
  status: JobStatus;
  error_note?: string | null;
  supersedes_folder_no?: string | null;
  created_at?: string;
  updated_at?: string;
  attachments?: Record<DocType, JobAttachment | null>;
  uploaded_docs_count?: number;
  is_documents_complete?: boolean;
}

export interface NotificationItem {
  jobId: string;
  folderNo: string;
  vin: string;
  rawId: string;
  rawName: string;
  isComplete: boolean;
  missingDocs: DocType[];
  uploadedDocsCount: number;
  totalDocsCount: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface InvoiceItem {
  id: string;
  item_details: string;
  quantity: number;
  unit?: string;
  rate: number;
  tax_rate: number;
  tax_name?: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoice_no: string;
  customer_name: string;
  customer_address?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  raw_id?: string | null;
  vin?: string | null;
  folder_no?: string | null;
  invoice_date: string;
  terms: string;
  due_date: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid?: number;
  balance_due: number;
  status: InvoiceStatus;
  customer_notes?: string | null;
  terms_and_conditions?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PresetInvoiceService {
  name: string;
  rate: number;
  description?: string;
}


