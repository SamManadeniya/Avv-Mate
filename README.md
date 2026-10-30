# AVV Mate — Authorised Vehicle Verifier (AVV) Portal

A production-grade, secure, and reactive web service designed for Australian **Authorised Vehicle Verifiers (AVV)** and **Registered Automotive Workshops (RAW)** operating under the **Road Vehicles Standards Act (RVSA)** and the **ROVER / Register of Approved Vehicles (RAV)** framework.

---

## 🚀 Key Features

1. **4 Interconnected Core Modules**:
   - **Compliance Jobs**: Full pipeline tracking from incoming customer request, through 8 certificate/photo attachments and video evidence, to AVV physical verification and final RAV entry.
   - **Vehicles Master Registry**: 17-character VIN tracking, build month/year, VIA# (CRE import approval), workshop assignment, and MRE linkage.
   - **RAW Workshop Directory**: Registered Automotive Workshop directory with computed vehicle metrics.
   - **Model Reports (MRE)**: Approved model reports with SEV linkages and vehicle technical specifications (VCC, Tare weight, Power kW, Seats).

2. **Smart Autocomplete & Cross-Table Prefilling**:
   - In the **Vehicles Form**: Typing or choosing a `RAW ID` automatically pre-fills the `RAW Workshop Name`. Selecting an `MRE No` pre-fills the `Make` and `Model`.
   - In the **Compliance Jobs Form**: Typing or choosing a `VIN` automatically pre-fills the `RAW ID`, `RAW Workshop Name`, `MRE No`, `Make`, and `Model`.

3. **Progressive Document Attachments (Non-blocking)**:
   - 8 Document slots: `CRE`, `EC`, `CIN`, `WI`, `DC`, `VI`, `RAW DECLA`, `PHOTOS`.
   - 1 Video evidence slot: Dedicated Google Drive link / video URL.
   - Supports `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`.
   - **Non-blocking by design**: Documents are optional on job creation and can be uploaded or replaced incrementally over time as clients provide them.

4. **Live Document Readiness & Notification Center**:
   - Real-time notification cards categorizing vehicles into:
     - 🟢 **Ready for AVV Verification**: All 8 compliance documents verified.
     - ⚠️ **Action Required**: Clear badges displaying exact missing certificates (e.g. `[Missing: EC, RAW DECLA]`) with one-click upload access.
   - Automatically updates when missing files are attached.

5. **Reporting & Auditing**:
   - **Export to CSV**: Instant export of filtered data grids for workshops, vehicles, and jobs.
   - **PDF Compliance Report Generation**: Formal, printable compliance sheets with document checklists for client billing, audits, and ROVER records.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Icons**: Lucide React
- **Database & Storage**: Supabase (PostgreSQL 15 + RLS + Storage Buckets)
- **Reporting**: jsPDF + jsPDF-AutoTable + PapaParse
- **Hosting**: Netlify (Global CDN with atomic rollbacks and edge routing)

---

## 🗄️ Database Setup (Supabase)

1. Open your **Supabase Dashboard** at [https://supabase.com](https://supabase.com).
2. Navigate to your project (`rxbjexoxyfownnwxzbjn`).
3. Click on **SQL Editor** in the left sidebar.
4. Open the provided [`supabase_setup.sql`](./supabase_setup.sql) file from this repository.
5. Paste the contents into the SQL Editor and click **Run**.
6. This will automatically:
   - Create all 5 tables (`raw_workshops`, `model_reports`, `vehicles`, `compliance_jobs`, `job_attachments`).
   - Create views for live vehicle count aggregation and compliance metrics.
   - Configure the `compliance-docs` storage bucket for PDF/JPG/PNG attachments.
   - Set up Row Level Security (RLS) policies.
   - Insert initial seed data for workshops, model reports, and sample vehicles.

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
```

The application will be live at `http://localhost:5173`.

---

## 🌐 Deploy to Netlify

1. Push this repository to GitHub or GitLab.
2. Log in to [Netlify](https://app.netlify.com) and click **"Add new site" > "Import an existing project"**.
3. Select your repository.
4. Netlify will automatically detect settings from [`netlify.toml`](./netlify.toml):
   - **Build Command**: `npm run build`
   - **Publish directory**: `dist`
5. Under **Environment variables**, verify the following variables are set:
   - `VITE_SUPABASE_URL=https://rxbjexoxyfownnwxzbjn.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=sb_publishable_ikWflHuunjprfe1wrWcG6w_McBNUBpu`
6. Click **Deploy Site**.

