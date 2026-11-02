-- ==============================================================================
-- AVV MATE DATABASE SETUP SCRIPT (SUPABASE / POSTGRESQL)
-- 100% Re-runnable, Idempotent, Zero Warnings (No DROP keywords)
-- Tables, Columns, Date Ranges, Author, Storage, RLS & Seed Data
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CORE TABLES & COLUMNS

-- Table 1: RAW Workshops (Registered Automotive Workshops)
CREATE TABLE IF NOT EXISTS public.raw_workshops (
    raw_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: Model Reports (MREs with technical specs and SEV linkages)
CREATE TABLE IF NOT EXISTS public.model_reports (
    mre_no VARCHAR(50) PRIMARY KEY,
    build_from DATE,
    build_to DATE,
    sev_no VARCHAR(50),
    sev_build_from DATE,
    sev_build_to DATE,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    vcc VARCHAR(10),
    tare_kg INTEGER,
    power_kw INTEGER,
    seats INTEGER,
    author VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all Model Report columns exist if the table was created previously
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS build_from DATE;
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS build_to DATE;
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS sev_build_from DATE;
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS sev_build_to DATE;
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS make VARCHAR(100);
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS model VARCHAR(100);
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS vcc VARCHAR(10);
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS tare_kg INTEGER;
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS power_kw INTEGER;
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS seats INTEGER;
ALTER TABLE public.model_reports ADD COLUMN IF NOT EXISTS author VARCHAR(255);

-- Table 3: Vehicles Master Registry
CREATE TABLE IF NOT EXISTS public.vehicles (
    vin VARCHAR(17) PRIMARY KEY,
    build_date VARCHAR(20) NOT NULL,
    via_no VARCHAR(50),
    raw_id VARCHAR(50) REFERENCES public.raw_workshops(raw_id) ON UPDATE CASCADE ON DELETE SET NULL,
    mre_no VARCHAR(50) REFERENCES public.model_reports(mre_no) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vin_no_illegal_chars CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$')
);

-- Table 4: Compliance Jobs (The operational verification pipeline)
CREATE TABLE IF NOT EXISTS public.compliance_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_no VARCHAR(50) UNIQUE NOT NULL,
    vin VARCHAR(17) NOT NULL REFERENCES public.vehicles(vin) ON UPDATE CASCADE ON DELETE RESTRICT,
    raw_id VARCHAR(50) REFERENCES public.raw_workshops(raw_id) ON UPDATE CASCADE ON DELETE SET NULL,
    mre_no VARCHAR(50) REFERENCES public.model_reports(mre_no) ON UPDATE CASCADE ON DELETE SET NULL,
    request_received DATE NOT NULL DEFAULT CURRENT_DATE,
    videos_url TEXT,
    avv_verification_date DATE,
    rav_date_of_entry DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'verified', 'rav_entered', 'errored')),
    error_note TEXT,
    supersedes_folder_no VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all Compliance Jobs columns exist if the table was created previously
ALTER TABLE public.compliance_jobs ADD COLUMN IF NOT EXISTS videos_url TEXT;
ALTER TABLE public.compliance_jobs ADD COLUMN IF NOT EXISTS avv_verification_date DATE;
ALTER TABLE public.compliance_jobs ADD COLUMN IF NOT EXISTS rav_date_of_entry DATE;
ALTER TABLE public.compliance_jobs ADD COLUMN IF NOT EXISTS error_note TEXT;
ALTER TABLE public.compliance_jobs ADD COLUMN IF NOT EXISTS supersedes_folder_no VARCHAR(50);

-- Table 5: Job Attachments (Progressive document uploads)
CREATE TABLE IF NOT EXISTS public.job_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.compliance_jobs(id) ON DELETE CASCADE,
    doc_type VARCHAR(30) NOT NULL CHECK (doc_type IN ('CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW_DECLA', 'PHOTOS')),
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    mime_type TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_job_doc UNIQUE(job_id, doc_type)
);

-- 3. INDEXES FOR PERFORMANCE & FAST LOOKUPS
CREATE INDEX IF NOT EXISTS idx_vehicles_raw_id ON public.vehicles(raw_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_mre_no ON public.vehicles(mre_no);
CREATE INDEX IF NOT EXISTS idx_compliance_jobs_vin ON public.compliance_jobs(vin);
CREATE INDEX IF NOT EXISTS idx_compliance_jobs_raw_id ON public.compliance_jobs(raw_id);
CREATE INDEX IF NOT EXISTS idx_compliance_jobs_mre_no ON public.compliance_jobs(mre_no);
CREATE INDEX IF NOT EXISTS idx_compliance_jobs_status ON public.compliance_jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_attachments_job_id ON public.job_attachments(job_id);

-- 4. AUTOMATIC UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers safely without DROP statements
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_raw_workshops_updated_at') THEN
        CREATE TRIGGER trg_raw_workshops_updated_at BEFORE UPDATE ON public.raw_workshops FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_model_reports_updated_at') THEN
        CREATE TRIGGER trg_model_reports_updated_at BEFORE UPDATE ON public.model_reports FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vehicles_updated_at') THEN
        CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_compliance_jobs_updated_at') THEN
        CREATE TRIGGER trg_compliance_jobs_updated_at BEFORE UPDATE ON public.compliance_jobs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- 5. VIEWS FOR REPORTING & REALTIME METRICS

-- Workshop summary view with live total vehicle count
CREATE OR REPLACE VIEW public.v_raw_workshops_summary AS
SELECT 
    w.raw_id,
    w.name,
    w.contact_email,
    w.contact_phone,
    w.created_at,
    w.updated_at,
    COUNT(v.vin) AS total_vehicles
FROM public.raw_workshops w
LEFT JOIN public.vehicles v ON v.raw_id = w.raw_id
GROUP BY w.raw_id, w.name, w.contact_email, w.contact_phone, w.created_at, w.updated_at;

-- Detailed compliance jobs view with vehicle specs, author, and completeness
CREATE OR REPLACE VIEW public.v_compliance_jobs_detailed AS
SELECT 
    j.id AS job_id,
    j.folder_no,
    j.vin,
    v.build_date,
    v.via_no,
    j.raw_id,
    w.name AS raw_workshop_name,
    j.mre_no,
    m.make,
    m.model,
    m.vcc,
    m.tare_kg,
    m.power_kw,
    m.seats,
    m.author,
    j.request_received,
    j.videos_url,
    j.avv_verification_date,
    j.rav_date_of_entry,
    j.status,
    j.error_note,
    j.supersedes_folder_no,
    j.created_at,
    j.updated_at,
    COALESCE(att.doc_count, 0) AS uploaded_docs_count,
    CASE WHEN COALESCE(att.doc_count, 0) = 8 THEN true ELSE false END AS is_documents_complete
FROM public.compliance_jobs j
LEFT JOIN public.vehicles v ON v.vin = j.vin
LEFT JOIN public.raw_workshops w ON w.raw_id = j.raw_id
LEFT JOIN public.model_reports m ON m.mre_no = j.mre_no
LEFT JOIN (
    SELECT job_id, COUNT(*) AS doc_count 
    FROM public.job_attachments 
    GROUP BY job_id
) att ON att.job_id = j.id;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.raw_workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- raw_workshops policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read access raw_workshops') THEN
        CREATE POLICY "Allow public read access raw_workshops" ON public.raw_workshops FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public write access raw_workshops') THEN
        CREATE POLICY "Allow public write access raw_workshops" ON public.raw_workshops FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- model_reports policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read access model_reports') THEN
        CREATE POLICY "Allow public read access model_reports" ON public.model_reports FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public write access model_reports') THEN
        CREATE POLICY "Allow public write access model_reports" ON public.model_reports FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- vehicles policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read access vehicles') THEN
        CREATE POLICY "Allow public read access vehicles" ON public.vehicles FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public write access vehicles') THEN
        CREATE POLICY "Allow public write access vehicles" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- compliance_jobs policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read access compliance_jobs') THEN
        CREATE POLICY "Allow public read access compliance_jobs" ON public.compliance_jobs FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public write access compliance_jobs') THEN
        CREATE POLICY "Allow public write access compliance_jobs" ON public.compliance_jobs FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- job_attachments policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read access job_attachments') THEN
        CREATE POLICY "Allow public read access job_attachments" ON public.job_attachments FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public write access job_attachments') THEN
        CREATE POLICY "Allow public write access job_attachments" ON public.job_attachments FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 7. SUPABASE STORAGE BUCKET FOR COMPLIANCE DOCS
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-docs', 'compliance-docs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow public read compliance-docs') THEN
        CREATE POLICY "Allow public read compliance-docs" ON storage.objects FOR SELECT USING (bucket_id = 'compliance-docs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow public upload compliance-docs') THEN
        CREATE POLICY "Allow public upload compliance-docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'compliance-docs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow public update compliance-docs') THEN
        CREATE POLICY "Allow public update compliance-docs" ON storage.objects FOR UPDATE USING (bucket_id = 'compliance-docs') WITH CHECK (bucket_id = 'compliance-docs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow public delete compliance-docs') THEN
        CREATE POLICY "Allow public delete compliance-docs" ON storage.objects FOR DELETE USING (bucket_id = 'compliance-docs');
    END IF;
END $$;

-- 8. INITIAL SEED DATA (FROM DASHBOARD SCREENSHOTS)

-- Seed Workshops
INSERT INTO public.raw_workshops (raw_id, name) VALUES
('RAW-000153', 'AKINA SPEEDSTARS PTY LTD'),
('RAW-000228', 'ANNING AUS PTY LTD'),
('RAW-000147', 'BOURAK SJ ZISH PTY LTD'),
('RAW-000099', 'FU SHENG(AUST) PTY LTD'),
('RAW-000173', 'HHT AUTOMOTIVE SERVICES PTY LTD'),
('RAW-000116', 'IMPORT CAR COMPLIANCE PTY LTD'),
('RAW-000245', 'NINETYNINE GROUP PTY LTD'),
('RAW-000175', 'SEAN PHAN & CO INVESTMENTS PTY LTD'),
('RAW-000070', 'SYDNEY UNIQUE MOTORS PTY LTD')
ON CONFLICT (raw_id) DO NOTHING;

-- Seed Model Reports
INSERT INTO public.model_reports (mre_no, sev_no, make, model) VALUES
('MRE-000008', 'SEV-000696', 'Toyota', 'Crown'),
('MRE-000076', 'SEV-000773', 'Toyota', 'MARK II IR-V'),
('MRE-000601', 'SEV-000806', 'Toyota', 'Porte / Spade'),
('MRE-000117', 'SEV-000691', 'NISSAN', 'Leaf'),
('MRE-000694', 'SEV-000730', 'Toyota', 'Corolla 160 SER'),
('MRE-000575', 'SEV-000735', 'Toyota', 'C-HR'),
('MRE-000647', 'SEV-000764', 'Toyota', 'Prius'),
('MRE-000650', 'SEV-000667', 'Honda', 'Fit Hybrid'),
('MRE-000719', 'SEV-000643', 'Toyota', 'Corolla Touring Wagon'),
('MRE-000030', 'SEV-000738', 'Toyota', '80 Series Welcab'),
('MRE-000031', 'SVC000678', 'MITSUBISHI', 'Lancer'),
('MRE-000035', 'SEV-000773', 'Toyota', 'MARK II IR-V'),
('MRE-000038', 'SEV-000657', 'Toyota', 'Hiace'),
('MRE-000090', 'SEV-000888', 'Toyota', '80 Series Hybrid'),
('MRE-000108', 'SEV-000717', 'Honda', 'Odyssey'),
('MRE-000120', 'SEV-000898', 'MITSUBISHI', 'LANCER EVOLUTION X'),
('MRE-000161', 'SEV-000692', 'SUZUKI', 'Swift'),
('MRE-000162', 'SEV-000667', 'Honda', 'Fit Hybrid'),
('MRE-000181', 'SEV-000643', 'Toyota', 'Corolla Touring Wagon'),
('MRE-000186', 'SEV-001014', 'Honda', 'N-Box'),
('MRE-000203', 'SEV-000921', 'LEXUS', 'LS460'),
('MRE-000209', 'SEV-000975', 'NISSAN', 'SERENA'),
('MRE-000211', 'SEV-000897', 'SUBARU', 'Legacy'),
('MRE-000233', 'SEV-000813', 'Toyota', 'Hiace Campervan'),
('MRE-000247', 'SEV-000664', 'Honda', 'Fit Hybrid')
ON CONFLICT (mre_no) DO NOTHING;

-- Seed Sample Vehicle
INSERT INTO public.vehicles (vin, build_date, via_no, raw_id, mre_no) VALUES
('6ZZLLA400K0042734', '07/2020', 'CRE-145420', 'RAW-000153', 'MRE-000694')
ON CONFLICT (vin) DO NOTHING;
