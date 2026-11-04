import React from 'react';
import { 
  Car, 
  Wrench, 
  FileText, 
  ShieldCheck, 
  Plus, 
  HardDrive,
  FileSpreadsheet,
  RefreshCw,
  Database,
  Receipt
} from 'lucide-react';

export type ActiveTab = 'jobs' | 'vehicles' | 'workshops' | 'reports' | 'invoices';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onNewJobClick: () => void;
  onDriveConfigClick?: () => void;
  onMasterSheetClick?: () => void;
  masterSheetUrl?: string;
  onSyncAllToSheets?: () => void;
  isSyncingSheets?: boolean;
  onRestoreSeedData?: () => void;
  counts: {
    jobs: number;
    vehicles: number;
    workshops: number;
    reports: number;
    invoices?: number;
  };
  isDriveConnected?: boolean;
  isSheetsPrimary?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onNewJobClick,
  onDriveConfigClick,
  onMasterSheetClick,
  masterSheetUrl,
  onSyncAllToSheets,
  isSyncingSheets = false,
  onRestoreSeedData,
  counts,
  isDriveConnected = false,
  isSheetsPrimary = false,
}) => {
  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: React.ReactNode; count: number }[] = [
    {
      id: 'jobs',
      label: 'Compliance Jobs',
      shortLabel: 'Jobs',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
      count: counts.jobs,
    },
    {
      id: 'vehicles',
      label: 'Vehicles',
      shortLabel: 'Vehicles',
      icon: <Car className="w-4 h-4 shrink-0" />,
      count: counts.vehicles,
    },
    {
      id: 'workshops',
      label: 'RAW Workshops',
      shortLabel: 'Workshops',
      icon: <Wrench className="w-4 h-4 shrink-0" />,
      count: counts.workshops,
    },
    {
      id: 'reports',
      label: 'Model Reports',
      shortLabel: 'Reports',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      count: counts.reports,
    },
    {
      id: 'invoices',
      label: 'Invoices',
      shortLabel: 'Invoices',
      icon: <Receipt className="w-4 h-4 shrink-0" />,
      count: counts.invoices ?? 0,
    },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        {/* Top Header Row */}
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-sky-800 flex items-center justify-center text-white font-display font-bold text-base sm:text-lg shadow-xs shrink-0">
              AV
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-base sm:text-lg tracking-tight text-slate-900 whitespace-nowrap">
                  AVV MATE
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded bg-sky-100 text-sky-800 shrink-0">
                  RVSA
                </span>
              </div>
              <p className="hidden 2xl:block text-[11px] text-slate-500 font-medium whitespace-nowrap">
                Authorised Vehicle Verifier & Compliance Workbench
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links (visible on lg screens 1024px+) */}
          <nav className="hidden lg:flex items-center gap-1 shrink-0">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3.5 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-semibold transition shrink-0 whitespace-nowrap ${
                    isActive
                      ? 'bg-sky-50 text-sky-800 shadow-xs border border-sky-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className={isActive ? 'text-sky-700' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span className="hidden xl:inline">{item.label}</span>
                  <span className="xl:hidden">{item.shortLabel}</span>
                  <span
                    className={`ml-0.5 text-[10px] xl:text-xs px-1.5 py-0.2 rounded-full font-mono ${
                      isActive
                        ? 'bg-sky-200/80 text-sky-900 font-bold'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Actions & Connection Status */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Master Google Spreadsheet Button with live status */}
            {isDriveConnected && (
              <button
                type="button"
                onClick={() => {
                  if (onMasterSheetClick) {
                    onMasterSheetClick();
                  } else if (masterSheetUrl) {
                    window.open(masterSheetUrl, '_blank');
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 transition shadow-2xs cursor-pointer shrink-0"
                title={isSheetsPrimary ? "Google Sheets DB Primary — Open Master Sheet" : "Open Master Google Spreadsheet"}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="hidden sm:inline">Master Sheet</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Google Sheets DB Active" />
              </button>
            )}

            {/* Sync All Tables to Master Sheet */}
            {isDriveConnected && onSyncAllToSheets && (
              <button
                type="button"
                onClick={onSyncAllToSheets}
                disabled={isSyncingSheets}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 transition disabled:opacity-50 cursor-pointer shrink-0"
                title="Sync all tables (Compliance Jobs, Vehicles, RAW Workshops, Model Reports, SVC, Invoices) to Master Google Sheet"
              >
                <RefreshCw className={`w-3 h-3 text-sky-600 shrink-0 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span className="hidden xl:inline">{isSyncingSheets ? 'Syncing...' : 'Sync Sheet'}</span>
              </button>
            )}

            {/* Google Drive Configuration Button */}
            {onDriveConfigClick && (
              <button
                type="button"
                onClick={onDriveConfigClick}
                className="p-1.5 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition cursor-pointer shrink-0"
                title="Google Drive Storage Settings"
              >
                <HardDrive className={`w-3.5 h-3.5 ${isDriveConnected ? 'text-emerald-600' : 'text-slate-500'}`} />
              </button>
            )}

            {/* Restore Initial Seed Data if Database is completely empty */}
            {onRestoreSeedData && (counts.jobs + counts.vehicles + counts.workshops + counts.reports === 0) && (
              <button
                type="button"
                onClick={onRestoreSeedData}
                disabled={isSyncingSheets}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer shrink-0"
                title="Restore default master records"
              >
                <Database className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">Restore Data</span>
              </button>
            )}

            <button
              onClick={onNewJobClick}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs sm:text-sm font-semibold rounded-md shadow-xs transition shrink-0"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>New Job</span>
            </button>
          </div>
        </div>

        {/* Mobile & Tablet Navigation Strip (visible below lg screen < 1024px) */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto py-2 border-t border-slate-100 -mx-3 sm:-mx-4 px-3 sm:px-4 scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition shrink-0 ${
                  isActive
                    ? 'bg-sky-100 text-sky-900 border border-sky-300 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200'
                }`}
              >
                <span className={isActive ? 'text-sky-700' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? 'bg-sky-200 text-sky-900 font-bold'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

