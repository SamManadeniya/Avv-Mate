import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar';
import { NotificationCenter } from './components/NotificationCenter';
import { ComplianceJobsView } from './components/views/ComplianceJobsView';
import { VehiclesView } from './components/views/VehiclesView';
import { WorkshopsView } from './components/views/WorkshopsView';
import { ModelReportsView } from './components/views/ModelReportsView';

import { ComplianceJobModal } from './components/modals/ComplianceJobModal';
import { VehicleModal } from './components/modals/VehicleModal';
import { WorkshopModal } from './components/modals/WorkshopModal';
import { ModelReportModal } from './components/modals/ModelReportModal';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { RequestDocsModal } from './components/modals/RequestDocsModal';
import { GoogleDriveConfigModal } from './components/modals/GoogleDriveConfigModal';

import { complianceJobService } from './services/complianceJobService';
import { vehicleService } from './services/vehicleService';
import { workshopService } from './services/workshopService';
import { modelReportService } from './services/modelReportService';
import { googleDriveService } from './services/googleDriveService';
import { googleSheetsService } from './services/googleSheetsService';
import {
  DEFAULT_COMPLIANCE_JOBS,
  DEFAULT_VEHICLES,
  DEFAULT_RAW_WORKSHOPS,
  DEFAULT_MODEL_REPORTS,
} from './data/seedData';

import type { ComplianceJob, Vehicle, RawWorkshop, ModelReport } from './types';
import { RefreshCw, Database, FileSpreadsheet, AlertTriangle, ExternalLink } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('jobs');
  const [, setIsConnected] = useState(true);
  const [, setIsLoading] = useState(true);
  const [dbSetupNeeded, setDbSetupNeeded] = useState(false);

  // Google Sheets Master Database State (4 Tabs)
  const [isSheetsPrimary, setIsSheetsPrimary] = useState(() => googleSheetsService.isSheetsPrimary());
  const [masterSheetUrl, setMasterSheetUrl] = useState<string>(() => googleSheetsService.getMasterSheetUrl());
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsFeedback, setSheetsFeedback] = useState<string | null>(null);
  const [sheetsApiDisabledUrl, setSheetsApiDisabledUrl] = useState<string | null>(null);

  // Core Data Lists
  const [complianceJobs, setComplianceJobs] = useState<ComplianceJob[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [workshops, setWorkshops] = useState<RawWorkshop[]>([]);
  const [modelReports, setModelReports] = useState<ModelReport[]>([]);

  // Modal States
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ComplianceJob | null>(null);

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const [isWorkshopModalOpen, setIsWorkshopModalOpen] = useState(false);
  const [selectedWorkshop, setSelectedWorkshop] = useState<RawWorkshop | null>(null);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ModelReport | null>(null);

  // Request Docs Modal State
  const [isRequestDocsOpen, setIsRequestDocsOpen] = useState(false);
  const [jobForDocRequest, setJobForDocRequest] = useState<ComplianceJob | null>(null);

  // Google Drive Config Modal State
  const [isDriveConfigOpen, setIsDriveConfigOpen] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(() => googleDriveService.isConfigured());
  const [isAuthExpired, setIsAuthExpired] = useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'job' | 'vehicle' | 'workshop' | 'report';
    id: string;
    title: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load All Data from Google Sheets or Supabase
  const loadData = useCallback(async () => {
    // 0. Instantly hydrate state from local cache so page refresh is instantaneous (0ms delay)
    const cached = googleSheetsService.getCachedMasterData();
    if (cached && (cached.jobs.length > 0 || cached.vehicles.length > 0 || cached.workshops.length > 0 || cached.modelReports.length > 0)) {
      setComplianceJobs(cached.jobs);
      setVehicles(cached.vehicles);
      setWorkshops(cached.workshops);
      setModelReports(cached.modelReports);
      setIsConnected(true);
      setDbSetupNeeded(false);
    }

    setIsLoading(true);

    // 1. If Google Sheets is chosen as Primary Database:
    if (googleSheetsService.isSheetsPrimary() && googleDriveService.isConfigured()) {
      try {
        const sheetData = await googleSheetsService.readAllFromMasterSheet();
        const sheetTotal =
          (sheetData?.jobs?.length || 0) +
          (sheetData?.vehicles?.length || 0) +
          (sheetData?.workshops?.length || 0) +
          (sheetData?.modelReports?.length || 0);

        if (sheetTotal > 0) {
          setComplianceJobs(sheetData.jobs || []);
          setVehicles(sheetData.vehicles || []);
          setWorkshops(sheetData.workshops || []);
          setModelReports(sheetData.modelReports || []);
          setIsConnected(true);
          setDbSetupNeeded(false);
          setIsLoading(false);
          return;
        }
        console.warn('Google Sheets returned 0 records. Checking Supabase or Seed Fallback...');
      } catch (sheetErr) {
        console.warn('Failed reading from Google Sheets Master DB, retaining cached data:', sheetErr);
        if (cached && (cached.jobs.length > 0 || cached.vehicles.length > 0 || cached.workshops.length > 0 || cached.modelReports.length > 0)) {
          setIsLoading(false);
          return;
        }
      }
    }

    // 2. Query Supabase
    try {
      const [jobsData, vehiclesData, workshopsData, reportsData] = await Promise.allSettled([
        complianceJobService.getAll(),
        vehicleService.getAll(),
        workshopService.getAll(),
        modelReportService.getAll(),
      ]);

      let hasSuccess = false;
      let hasTableMissingError = false;

      let currentJobs: ComplianceJob[] = [];
      let currentVehicles: Vehicle[] = [];
      let currentWorkshops: RawWorkshop[] = [];
      let currentReports: ModelReport[] = [];

      if (jobsData.status === 'fulfilled' && jobsData.value.length > 0) {
        currentJobs = jobsData.value;
        setComplianceJobs(currentJobs);
        hasSuccess = true;
      } else if (jobsData.status === 'rejected' && jobsData.reason?.message?.includes('Could not find the table')) {
        hasTableMissingError = true;
      }

      if (vehiclesData.status === 'fulfilled' && vehiclesData.value.length > 0) {
        currentVehicles = vehiclesData.value;
        setVehicles(currentVehicles);
        hasSuccess = true;
      } else if (vehiclesData.status === 'rejected' && vehiclesData.reason?.message?.includes('Could not find the table')) {
        hasTableMissingError = true;
      }

      if (workshopsData.status === 'fulfilled' && workshopsData.value.length > 0) {
        currentWorkshops = workshopsData.value;
        setWorkshops(currentWorkshops);
        hasSuccess = true;
      }

      if (reportsData.status === 'fulfilled' && reportsData.value.length > 0) {
        currentReports = reportsData.value;
        setModelReports(currentReports);
        hasSuccess = true;
      }

      // If Supabase is offline/missing, fallback to Google Sheets Master Database!
      if (!hasSuccess && googleDriveService.isConfigured()) {
        try {
          const sheetData = await googleSheetsService.readAllFromMasterSheet();
          if (
            sheetData.jobs.length > 0 ||
            sheetData.vehicles.length > 0 ||
            sheetData.workshops.length > 0 ||
            sheetData.modelReports.length > 0
          ) {
            setComplianceJobs(sheetData.jobs);
            setVehicles(sheetData.vehicles);
            setWorkshops(sheetData.workshops);
            setModelReports(sheetData.modelReports);
            setIsConnected(true);
            setDbSetupNeeded(false);
            setIsLoading(false);
            return;
          }
        } catch (_) {}
      }

      // 3. Fallback: If neither Supabase nor Google Sheets has records, hydrate DEFAULT_SEED_DATA!
      const totalLoaded = currentJobs.length + currentVehicles.length + currentWorkshops.length + currentReports.length;
      if (totalLoaded === 0) {
        const cached = googleSheetsService.getCachedMasterData();
        const cachedTotal =
          (cached?.jobs?.length || 0) +
          (cached?.vehicles?.length || 0) +
          (cached?.workshops?.length || 0) +
          (cached?.modelReports?.length || 0);

        if (cachedTotal > 0 && cached) {
          setComplianceJobs(cached.jobs);
          setVehicles(cached.vehicles);
          setWorkshops(cached.workshops);
          setModelReports(cached.modelReports);
        } else {
          console.info('Auto-populating database with default seed records (9 Workshops, 25 Reports, Vehicles, Jobs)...');
          setComplianceJobs(DEFAULT_COMPLIANCE_JOBS);
          setVehicles(DEFAULT_VEHICLES);
          setWorkshops(DEFAULT_RAW_WORKSHOPS);
          setModelReports(DEFAULT_MODEL_REPORTS);
          googleSheetsService.setCachedMasterData({
            jobs: DEFAULT_COMPLIANCE_JOBS,
            vehicles: DEFAULT_VEHICLES,
            workshops: DEFAULT_RAW_WORKSHOPS,
            modelReports: DEFAULT_MODEL_REPORTS,
          });

          // Automatically sync seed data into Google Sheets in the background so the Master Sheet is repopulated immediately!
          if (googleDriveService.isConfigured()) {
            googleSheetsService.syncAllDataToMasterSheet(
              DEFAULT_COMPLIANCE_JOBS,
              DEFAULT_VEHICLES,
              DEFAULT_RAW_WORKSHOPS,
              DEFAULT_MODEL_REPORTS
            ).catch(e => console.warn('Auto-seed sync notice:', e));
          }
        }
        hasSuccess = true;
      }

      // If Supabase loaded and Google Drive is connected, initialize master sheet URL in background
      if (hasSuccess && googleDriveService.isConfigured()) {
        googleSheetsService.getMasterSpreadsheet().then(info => {
          setMasterSheetUrl(info.webViewLink);
        }).catch(() => {});
      }

      if (hasTableMissingError && !googleSheetsService.isSheetsPrimary()) {
        setDbSetupNeeded(true);
      } else {
        setDbSetupNeeded(false);
      }

      setIsConnected(hasSuccess);
    } catch (err) {
      console.error('Failed to load data:', err);
      if (googleDriveService.isConfigured()) {
        try {
          const sheetData = await googleSheetsService.readAllFromMasterSheet();
          setComplianceJobs(sheetData.jobs);
          setVehicles(sheetData.vehicles);
          setWorkshops(sheetData.workshops);
          setModelReports(sheetData.modelReports);
          setIsConnected(true);
          setDbSetupNeeded(false);
        } catch (_) {
          setIsConnected(false);
        }
      } else {
        setIsConnected(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check if Google redirected back with auth token or authorization code
    googleDriveService.parseAuthCallbackFromUrl().then((tokenParsed) => {
      if (tokenParsed) {
        setIsDriveConnected(true);
        setIsAuthExpired(false);
        loadData();
      }
    });

    loadData();

    const handleConfigChange = () => {
      setIsDriveConnected(googleDriveService.isConfigured());
    };
    const handleAuthExpired = () => setIsAuthExpired(true);
    const handleAuthRestored = () => {
      setIsAuthExpired(false);
      loadData();
    };
    const handleDbModeChange = () => {
      setIsSheetsPrimary(googleSheetsService.isSheetsPrimary());
      loadData();
    };

    window.addEventListener('avv_mate_drive_config_updated', handleConfigChange);
    window.addEventListener('avv_mate_auth_expired', handleAuthExpired);
    window.addEventListener('avv_mate_auth_restored', handleAuthRestored);
    window.addEventListener('avv_mate_db_mode_changed', handleDbModeChange);

    return () => {
      window.removeEventListener('avv_mate_drive_config_updated', handleConfigChange);
      window.removeEventListener('avv_mate_auth_expired', handleAuthExpired);
      window.removeEventListener('avv_mate_auth_restored', handleAuthRestored);
      window.removeEventListener('avv_mate_db_mode_changed', handleDbModeChange);
    };
  }, [loadData]);

  // Handlers for Compliance Jobs
  const handleNewJob = () => {
    setSelectedJob(null);
    setIsJobModalOpen(true);
  };

  const handleEditJob = (job: ComplianceJob) => {
    setSelectedJob(job);
    setIsJobModalOpen(true);
  };

  const handleRequestDocs = (job: ComplianceJob) => {
    setJobForDocRequest(job);
    setIsRequestDocsOpen(true);
  };

  const handleDeleteJobClick = (job: ComplianceJob) => {
    setDeleteTarget({
      type: 'job',
      id: job.id,
      title: 'Delete Compliance Job',
      name: `Folder ${job.folder_no} (VIN: ${job.vin})`,
    });
  };

  // Handlers for Vehicles
  const handleNewVehicle = () => {
    setSelectedVehicle(null);
    setIsVehicleModalOpen(true);
  };

  const handleEditVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsVehicleModalOpen(true);
  };

  const handleDeleteVehicleClick = (vehicle: Vehicle) => {
    setDeleteTarget({
      type: 'vehicle',
      id: vehicle.vin,
      title: 'Delete Vehicle',
      name: `VIN ${vehicle.vin} (${vehicle.make || ''} ${vehicle.model || ''})`,
    });
  };

  // Handlers for Workshops
  const handleNewWorkshop = () => {
    setSelectedWorkshop(null);
    setIsWorkshopModalOpen(true);
  };

  const handleEditWorkshop = (workshop: RawWorkshop) => {
    setSelectedWorkshop(workshop);
    setIsWorkshopModalOpen(true);
  };

  const handleDeleteWorkshopClick = (workshop: RawWorkshop) => {
    setDeleteTarget({
      type: 'workshop',
      id: workshop.raw_id,
      title: 'Delete RAW Workshop',
      name: `${workshop.raw_id} • ${workshop.name}`,
    });
  };

  // Handlers for Model Reports
  const handleNewReport = () => {
    setSelectedReport(null);
    setIsReportModalOpen(true);
  };

  const handleEditReport = (report: ModelReport) => {
    setSelectedReport(report);
    setIsReportModalOpen(true);
  };

  const handleDeleteReportClick = (report: ModelReport) => {
    setDeleteTarget({
      type: 'report',
      id: report.mre_no,
      title: 'Delete Model Report',
      name: `${report.mre_no} • ${report.make} ${report.model}`,
    });
  };

  // Handlers for Google Sheets Master Database
  const handleMasterSheetOpen = async () => {
    // Open a blank tab synchronously during user click to defeat Safari popup blockers
    let newTab: Window | null = null;
    try {
      newTab = window.open('about:blank', '_blank');
    } catch (_) {}

    try {
      setSheetsFeedback('Syncing & opening Master Database in Google Sheets...');
      if (!googleDriveService.isTokenValid() && googleDriveService.getConfig().clientId) {
        await googleDriveService.requestOAuthToken();
      }

      // Auto-sync latest data to Master Sheet before opening ONLY if records exist
      const totalCurrent = complianceJobs.length + vehicles.length + workshops.length + modelReports.length;
      if (totalCurrent > 0) {
        try {
          await googleSheetsService.syncAllDataToMasterSheet(
            complianceJobs,
            vehicles,
            workshops,
            modelReports
          );
        } catch (syncErr) {
          console.warn('Pre-open sync notice:', syncErr);
        }
      }

      const info = await googleSheetsService.getMasterSpreadsheet(true);
      setMasterSheetUrl(info.webViewLink);
      if (newTab && !newTab.closed) {
        newTab.location.href = info.webViewLink;
      } else {
        window.open(info.webViewLink, '_blank');
      }
      setSheetsFeedback('✓ Master Database synced & opened in Google Sheets');
      setSheetsApiDisabledUrl(null);
      setTimeout(() => setSheetsFeedback(null), 5000);
    } catch (err: any) {
      if (newTab && !newTab.closed) {
        try { newTab.close(); } catch (_) {}
      }
      console.error('Error opening master sheet:', err);
      const isApiDisabled =
        Boolean(err.enableApiUrl) ||
        (err.message && (
          err.message.includes('sheets.googleapis.com') ||
          err.message.includes('SERVICE_DISABLED') ||
          err.message.includes('Google Sheets API has not been used')
        ));

      if (isApiDisabled) {
        setSheetsApiDisabledUrl('https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136');
        setSheetsFeedback(null);
      } else {
        setSheetsFeedback(`Notice: ${err.message || 'Opening AVV Mate Drive folder'}`);
        window.open('https://drive.google.com/drive/folders/12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5', '_blank');
      }
    }
  };

  const handleSyncAllToSheets = async () => {
    setIsSyncingSheets(true);
    setSheetsFeedback('Syncing all 5 tabs into Master Google Sheet...');
    try {
      let jobsToSync = complianceJobs;
      let vehiclesToSync = vehicles;
      let workshopsToSync = workshops;
      let reportsToSync = modelReports;

      const totalCurrent = jobsToSync.length + vehiclesToSync.length + workshopsToSync.length + reportsToSync.length;
      if (totalCurrent === 0) {
        jobsToSync = DEFAULT_COMPLIANCE_JOBS;
        vehiclesToSync = DEFAULT_VEHICLES;
        workshopsToSync = DEFAULT_RAW_WORKSHOPS;
        reportsToSync = DEFAULT_MODEL_REPORTS;
        setComplianceJobs(jobsToSync);
        setVehicles(vehiclesToSync);
        setWorkshops(workshopsToSync);
        setModelReports(reportsToSync);
      }

      const result = await googleSheetsService.syncAllDataToMasterSheet(
        jobsToSync,
        vehiclesToSync,
        workshopsToSync,
        reportsToSync
      );
      setMasterSheetUrl(result.spreadsheetUrl);
      setSheetsFeedback('✓ Synced all 5 tabs (Compliance_Jobs, Vehicles, RAW_Workshops, Model_Reports, SVC) in AVV Mate Master Database!');
      setSheetsApiDisabledUrl(null);
      setTimeout(() => setSheetsFeedback(null), 6000);
    } catch (err: any) {
      console.error('Error syncing to master sheet:', err);
      const isApiDisabled =
        Boolean(err.enableApiUrl) ||
        (err.message && (
          err.message.includes('sheets.googleapis.com') ||
          err.message.includes('SERVICE_DISABLED') ||
          err.message.includes('Google Sheets API has not been used')
        ));

      if (isApiDisabled) {
        setSheetsApiDisabledUrl('https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136');
        setSheetsFeedback(null);
      } else {
        setSheetsFeedback(`Sheet sync failed: ${err.message || 'Error'}`);
        setTimeout(() => setSheetsFeedback(null), 6000);
      }
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleRestoreSeedData = async () => {
    if (!window.confirm('Restore initial database records (9 RAW Workshops, 25 Model Reports, Vehicles, and Compliance Jobs) into both AVV Mate and Google Sheets?')) {
      return;
    }
    setIsSyncingSheets(true);
    setSheetsFeedback('Restoring initial master database records...');
    setComplianceJobs(DEFAULT_COMPLIANCE_JOBS);
    setVehicles(DEFAULT_VEHICLES);
    setWorkshops(DEFAULT_RAW_WORKSHOPS);
    setModelReports(DEFAULT_MODEL_REPORTS);
    googleSheetsService.setCachedMasterData({
      jobs: DEFAULT_COMPLIANCE_JOBS,
      vehicles: DEFAULT_VEHICLES,
      workshops: DEFAULT_RAW_WORKSHOPS,
      modelReports: DEFAULT_MODEL_REPORTS,
    });
    try {
      await googleSheetsService.syncAllDataToMasterSheet(
        DEFAULT_COMPLIANCE_JOBS,
        DEFAULT_VEHICLES,
        DEFAULT_RAW_WORKSHOPS,
        DEFAULT_MODEL_REPORTS
      );
      setSheetsFeedback('✓ Successfully restored all master records into Google Sheets!');
    } catch (e: any) {
      setSheetsFeedback(`Data restored locally. Sync note: ${e.message}`);
    } finally {
      setIsSyncingSheets(false);
      setTimeout(() => setSheetsFeedback(null), 5000);
    }
  };

  // CRUD Persistence Handlers (Instant in-memory update + Google Sheets Master DB + Supabase)
  const handleJobSaved = async (savedJob: ComplianceJob) => {
    let updatedJobs = complianceJobs;
    const idx = complianceJobs.findIndex(j => j.id === savedJob.id || j.folder_no === savedJob.folder_no);
    if (idx >= 0) {
      updatedJobs = [...complianceJobs];
      updatedJobs[idx] = savedJob;
    } else {
      updatedJobs = [savedJob, ...complianceJobs];
    }
    setComplianceJobs(updatedJobs);

    // Auto-link vehicle if new
    let updatedVehicles = vehicles;
    if (savedJob.vin) {
      const vIdx = vehicles.findIndex(v => v.vin.toUpperCase() === savedJob.vin.toUpperCase());
      if (vIdx >= 0) {
        const currentV = vehicles[vIdx];
        if (!currentV.raw_id && savedJob.raw_id) {
          updatedVehicles = [...vehicles];
          updatedVehicles[vIdx] = {
            ...currentV,
            raw_id: savedJob.raw_id,
            raw_workshop_name: savedJob.raw_workshop_name || currentV.raw_workshop_name,
            mre_no: savedJob.mre_no || currentV.mre_no,
            make: savedJob.make || currentV.make,
            model: savedJob.model || currentV.model,
          };
          setVehicles(updatedVehicles);
        }
      } else {
        const newV: Vehicle = {
          vin: savedJob.vin.toUpperCase(),
          build_date: savedJob.build_date || new Date().toISOString().slice(0, 7),
          via_no: savedJob.via_no || null,
          raw_id: savedJob.raw_id || null,
          raw_workshop_name: savedJob.raw_workshop_name || null,
          mre_no: savedJob.mre_no || null,
          make: savedJob.make || null,
          model: savedJob.model || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        updatedVehicles = [newV, ...vehicles];
        setVehicles(updatedVehicles);
      }
    }

    if (googleDriveService.isConfigured()) {
      try {
        await googleSheetsService.syncAllDataToMasterSheet(
          updatedJobs,
          updatedVehicles,
          workshops,
          modelReports
        );
      } catch (sheetSyncErr) {
        console.warn('Sheets sync on job save error:', sheetSyncErr);
      }
    }

    await loadData();
  };

  const handleVehicleSaved = async (savedVehicle: Vehicle) => {
    let updatedVehicles = vehicles;
    const idx = vehicles.findIndex(v => v.vin.toUpperCase() === savedVehicle.vin.toUpperCase());
    if (idx >= 0) {
      updatedVehicles = [...vehicles];
      updatedVehicles[idx] = savedVehicle;
    } else {
      updatedVehicles = [savedVehicle, ...vehicles];
    }
    setVehicles(updatedVehicles);

    if (googleDriveService.isConfigured()) {
      try {
        await googleSheetsService.syncAllDataToMasterSheet(
          complianceJobs,
          updatedVehicles,
          workshops,
          modelReports
        );
      } catch (sheetSyncErr) {
        console.warn('Sheets sync on vehicle save error:', sheetSyncErr);
      }
    }

    await loadData();
  };

  const handleWorkshopSaved = async (savedWorkshop: RawWorkshop) => {
    let updatedWorkshops = workshops;
    const idx = workshops.findIndex(w => w.raw_id.toUpperCase() === savedWorkshop.raw_id.toUpperCase());
    if (idx >= 0) {
      updatedWorkshops = [...workshops];
      updatedWorkshops[idx] = savedWorkshop;
    } else {
      updatedWorkshops = [savedWorkshop, ...workshops];
    }
    setWorkshops(updatedWorkshops);

    if (googleDriveService.isConfigured()) {
      try {
        await googleSheetsService.syncAllDataToMasterSheet(
          complianceJobs,
          vehicles,
          updatedWorkshops,
          modelReports
        );
      } catch (sheetSyncErr) {
        console.warn('Sheets sync on workshop save error:', sheetSyncErr);
      }
    }

    await loadData();
  };

  const handleModelReportSaved = async (savedReport: ModelReport) => {
    let updatedReports = modelReports;
    const idx = modelReports.findIndex(r => r.mre_no.toUpperCase() === savedReport.mre_no.toUpperCase());
    if (idx >= 0) {
      updatedReports = [...modelReports];
      updatedReports[idx] = savedReport;
    } else {
      updatedReports = [savedReport, ...modelReports];
    }
    setModelReports(updatedReports);

    if (googleDriveService.isConfigured()) {
      try {
        await googleSheetsService.syncAllDataToMasterSheet(
          complianceJobs,
          vehicles,
          workshops,
          updatedReports
        );
      } catch (sheetSyncErr) {
        console.warn('Sheets sync on model report save error:', sheetSyncErr);
      }
    }

    await loadData();
  };

  // Confirm Delete Action
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      // 1. Delete in Supabase if online
      try {
        if (deleteTarget.type === 'job') {
          await complianceJobService.delete(deleteTarget.id);
        } else if (deleteTarget.type === 'vehicle') {
          await vehicleService.delete(deleteTarget.id);
        } else if (deleteTarget.type === 'workshop') {
          await workshopService.delete(deleteTarget.id);
        } else if (deleteTarget.type === 'report') {
          await modelReportService.delete(deleteTarget.id);
        }
      } catch (sbErr) {
        console.warn('Supabase delete bypassed/failed:', sbErr);
      }

      // 2. Update state in memory
      let newJobs = complianceJobs;
      let newVehicles = vehicles;
      let newWorkshops = workshops;
      let newReports = modelReports;

      if (deleteTarget.type === 'job') {
        newJobs = complianceJobs.filter(j => j.id !== deleteTarget.id && j.folder_no !== deleteTarget.id);
        setComplianceJobs(newJobs);
      } else if (deleteTarget.type === 'vehicle') {
        newVehicles = vehicles.filter(v => v.vin.toUpperCase() !== deleteTarget.id.toUpperCase());
        setVehicles(newVehicles);
      } else if (deleteTarget.type === 'workshop') {
        newWorkshops = workshops.filter(w => w.raw_id.toUpperCase() !== deleteTarget.id.toUpperCase());
        setWorkshops(newWorkshops);
      } else if (deleteTarget.type === 'report') {
        newReports = modelReports.filter(r => r.mre_no.toUpperCase() !== deleteTarget.id.toUpperCase());
        setModelReports(newReports);
      }

      // 3. Immediately persist updated state to Master Google Sheet
      if (googleDriveService.isConfigured()) {
        try {
          await googleSheetsService.syncAllDataToMasterSheet(
            newJobs,
            newVehicles,
            newWorkshops,
            newReports
          );
        } catch (sheetErr) {
          console.warn('Sheets sync on delete error:', sheetErr);
        }
      }

      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message || 'Error deleting item'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Sticky Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewJobClick={handleNewJob}
        onDriveConfigClick={() => setIsDriveConfigOpen(true)}
        onMasterSheetClick={handleMasterSheetOpen}
        masterSheetUrl={masterSheetUrl}
        onSyncAllToSheets={handleSyncAllToSheets}
        onRestoreSeedData={handleRestoreSeedData}
        isSyncingSheets={isSyncingSheets}
        isSheetsPrimary={isSheetsPrimary}
        counts={{
          jobs: complianceJobs.length,
          vehicles: vehicles.length,
          workshops: workshops.length,
          reports: modelReports.length,
        }}
        isDriveConnected={isDriveConnected}
      />

      {/* Google Session Expired / Reconnect Banner */}
      {isAuthExpired && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-4 w-full animate-in fade-in">
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-lg text-amber-800 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                  <span>Google Authentication Session Expired</span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-semibold">Offline Safe</span>
                </h4>
                <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                  Your Google OAuth session has expired. All records are currently saved safely in your local browser cache. Click below to reconnect Google Drive & Sheets to resume real-time sync.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                onClick={async () => {
                  try {
                    await googleDriveService.requestOAuthToken();
                    setIsAuthExpired(false);
                    loadData();
                  } catch (e: any) {
                    window.location.href = googleDriveService.getDirectAuthUrl();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconnect Google Drive</span>
              </button>
              <button
                onClick={() => setIsAuthExpired(false)}
                className="px-3 py-2 text-xs font-semibold text-amber-900 hover:text-amber-950"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheets API Enablement Action Banner */}
      {sheetsApiDisabledUrl && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-4 w-full animate-in fade-in">
          <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                  <span>Action Required: Enable Google Sheets API</span>
                  <span className="text-[10px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full font-mono font-semibold">Project 43512054136</span>
                </h4>
                <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                  Google Drive API is connected, but Google Cloud requires <strong>Google Sheets API</strong> to be switched on in your project before AVV Mate can create and sync your 4 Master Database tabs. It takes 1 click and is completely free.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <a
                href={sheetsApiDisabledUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
              >
                <span>Enable Google Sheets API</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => {
                  setSheetsApiDisabledUrl(null);
                  handleSyncAllToSheets();
                }}
                disabled={isSyncingSheets}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 text-xs font-semibold rounded-lg transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span>Retry Sync</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheets Sync & Notification Banner */}
      {sheetsFeedback && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-3 w-full animate-in fade-in">
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg flex items-center justify-between gap-3 text-xs text-emerald-950 font-medium shadow-2xs">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{sheetsFeedback}</span>
            </div>
            {masterSheetUrl && (
              <a
                href={masterSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:text-emerald-950 underline shrink-0"
              >
                <span>Open Master Sheet &rarr;</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Database Setup Alert Banner if tables need migration */}
      {dbSetupNeeded && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-4 w-full">
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">
                  Supabase Schema Migration Ready
                </h4>
                <p className="text-xs text-amber-800 mt-1">
                  The AVV database tables are ready to be created. Please run the generated{' '}
                  <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold text-amber-900">
                    supabase_setup.sql
                  </code>{' '}
                  script in your Supabase SQL Editor to initialize all 4 tables, storage buckets, and seed data.
                </p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-200/80 hover:bg-amber-200 text-amber-900 text-xs font-semibold rounded transition shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Sync</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 w-full">
        {/* Compliance Jobs Tab View */}
        {activeTab === 'jobs' && (
          <div>
            {/* Live Notification & Document Readiness Center */}
            <NotificationCenter
              jobs={complianceJobs}
              onOpenJob={handleEditJob}
              onRequestDocs={handleRequestDocs}
            />

            {/* Main Compliance Pipeline Table View */}
            <ComplianceJobsView
              jobs={complianceJobs}
              onNewJob={handleNewJob}
              onEditJob={handleEditJob}
              onDeleteJob={handleDeleteJobClick}
              onRequestDocs={handleRequestDocs}
            />
          </div>
        )}

        {/* Vehicles Tab View */}
        {activeTab === 'vehicles' && (
          <VehiclesView
            vehicles={vehicles}
            onNewVehicle={handleNewVehicle}
            onEditVehicle={handleEditVehicle}
            onDeleteVehicle={handleDeleteVehicleClick}
          />
        )}

        {/* RAW Workshops Tab View */}
        {activeTab === 'workshops' && (
          <WorkshopsView
            workshops={workshops}
            onNewWorkshop={handleNewWorkshop}
            onEditWorkshop={handleEditWorkshop}
            onDeleteWorkshop={handleDeleteWorkshopClick}
          />
        )}

        {/* Model Reports Tab View */}
        {activeTab === 'reports' && (
          <ModelReportsView
            modelReports={modelReports}
            onNewReport={handleNewReport}
            onEditReport={handleEditReport}
            onDeleteReport={handleDeleteReportClick}
          />
        )}
      </main>

      {/* Modals */}
      <ComplianceJobModal
        isOpen={isJobModalOpen}
        onClose={() => setIsJobModalOpen(false)}
        onSaved={handleJobSaved}
        jobToEdit={selectedJob}
        vehicles={vehicles}
        workshops={workshops}
        modelReports={modelReports}
        lastFolderNo={complianceJobs.length > 0 ? complianceJobs[0].folder_no : null}
        onRequestDocs={handleRequestDocs}
      />

      <RequestDocsModal
        isOpen={isRequestDocsOpen}
        onClose={() => setIsRequestDocsOpen(false)}
        job={jobForDocRequest}
        workshops={workshops}
      />

      <VehicleModal
        isOpen={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
        onSaved={handleVehicleSaved}
        vehicleToEdit={selectedVehicle}
        workshops={workshops}
        modelReports={modelReports}
      />

      <WorkshopModal
        isOpen={isWorkshopModalOpen}
        onClose={() => setIsWorkshopModalOpen(false)}
        onSaved={handleWorkshopSaved}
        workshopToEdit={selectedWorkshop}
      />

      <ModelReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSaved={handleModelReportSaved}
        reportToEdit={selectedReport}
      />

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.title || 'Delete Item'}
        message={`Are you sure you want to delete ${deleteTarget?.name}? This action cannot be undone.`}
        isDeleting={isDeleting}
      />

      <GoogleDriveConfigModal
        isOpen={isDriveConfigOpen}
        onClose={() => setIsDriveConfigOpen(false)}
        onConfigSaved={() => setIsDriveConnected(googleDriveService.isConfigured())}
      />
    </div>
  );
};
