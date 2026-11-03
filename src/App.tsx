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

import type { ComplianceJob, Vehicle, RawWorkshop, ModelReport } from './types';
import { RefreshCw, Database } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('jobs');
  const [isConnected, setIsConnected] = useState(true);
  const [, setIsLoading] = useState(true);
  const [dbSetupNeeded, setDbSetupNeeded] = useState(false);

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

  useEffect(() => {
    // Check if Google redirected back with auth token
    const tokenParsed = googleDriveService.parseAuthCallbackFromUrl();
    if (tokenParsed) {
      setIsDriveConnected(true);
    }

    const handleConfigChange = () => {
      setIsDriveConnected(googleDriveService.isConfigured());
    };
    window.addEventListener('avv_mate_drive_config_updated', handleConfigChange);
    return () => {
      window.removeEventListener('avv_mate_drive_config_updated', handleConfigChange);
    };
  }, []);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'job' | 'vehicle' | 'workshop' | 'report';
    id: string;
    title: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load All Data from Supabase
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [jobsData, vehiclesData, workshopsData, reportsData] = await Promise.allSettled([
        complianceJobService.getAll(),
        vehicleService.getAll(),
        workshopService.getAll(),
        modelReportService.getAll(),
      ]);

      let hasSuccess = false;
      let hasTableMissingError = false;

      if (jobsData.status === 'fulfilled') {
        setComplianceJobs(jobsData.value);
        hasSuccess = true;
      } else if (jobsData.reason?.message?.includes('Could not find the table')) {
        hasTableMissingError = true;
      }

      if (vehiclesData.status === 'fulfilled') {
        setVehicles(vehiclesData.value);
        hasSuccess = true;
      } else if (vehiclesData.reason?.message?.includes('Could not find the table')) {
        hasTableMissingError = true;
      }

      if (workshopsData.status === 'fulfilled') {
        setWorkshops(workshopsData.value);
        hasSuccess = true;
      }

      if (reportsData.status === 'fulfilled') {
        setModelReports(reportsData.value);
        hasSuccess = true;
      }

      if (hasTableMissingError) {
        setDbSetupNeeded(true);
      } else {
        setDbSetupNeeded(false);
      }

      setIsConnected(hasSuccess);
    } catch (err) {
      console.error('Failed to load Supabase data:', err);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
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

  // Confirm Delete Action
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
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
        counts={{
          jobs: complianceJobs.length,
          vehicles: vehicles.length,
          workshops: workshops.length,
          reports: modelReports.length,
        }}
        isConnected={isConnected}
        isDriveConnected={isDriveConnected}
      />

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
        onSaved={loadData}
        jobToEdit={selectedJob}
        vehicles={vehicles}
        workshops={workshops}
        modelReports={modelReports}
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
        onSaved={loadData}
        vehicleToEdit={selectedVehicle}
        workshops={workshops}
        modelReports={modelReports}
      />

      <WorkshopModal
        isOpen={isWorkshopModalOpen}
        onClose={() => setIsWorkshopModalOpen(false)}
        onSaved={loadData}
        workshopToEdit={selectedWorkshop}
      />

      <ModelReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSaved={loadData}
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
