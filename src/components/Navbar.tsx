import React from 'react';
import { 
  Car, 
  Wrench, 
  FileText, 
  ShieldCheck, 
  Plus, 
  CheckCircle, 
  AlertCircle,
  HardDrive,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';

export type ActiveTab = 'jobs' | 'vehicles' | 'workshops' | 'reports';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onNewJobClick: () => void;
  onDriveConfigClick?: () => void;
  onMasterSheetClick?: () => void;
  masterSheetUrl?: string;
  onSyncAllToSheets?: () => void;
  isSyncingSheets?: boolean;
  isSheetsPrimary?: boolean;
  onToggleDbMode?: (useSheets: boolean) => void;
  counts: {
    jobs: number;
    vehicles: number;
    workshops: number;
    reports: number;
  };
  isConnected: boolean;
  isDriveConnected?: boolean;
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
  isSheetsPrimary = false,
  onToggleDbMode,
  counts,
  isConnected,
  isDriveConnected = false,
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; count: number }[] = [
    {
      id: 'jobs',
      label: 'Compliance Jobs',
      icon: <ShieldCheck className="w-4 h-4" />,
      count: counts.jobs,
    },
    {
      id: 'vehicles',
      label: 'Vehicles',
      icon: <Car className="w-4 h-4" />,
      count: counts.vehicles,
    },
    {
      id: 'workshops',
      label: 'RAW Workshops',
      icon: <Wrench className="w-4 h-4" />,
      count: counts.workshops,
    },
    {
      id: 'reports',
      label: 'Model Reports',
      icon: <FileText className="w-4 h-4" />,
      count: counts.reports,
    },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Header Row */}
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-sky-800 flex items-center justify-center text-white font-display font-bold text-lg sm:text-xl shadow-xs shrink-0">
              AV
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-display font-bold text-lg sm:text-xl tracking-tight text-slate-900">
                  AVV MATE
                </span>
                <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase rounded bg-sky-100 text-sky-800">
                  RVSA / ROVER
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500 font-medium">
                Authorised Vehicle Verifier & Compliance Workbench
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links (hidden on mobile, visible md+) */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold transition ${
                    isActive
                      ? 'bg-sky-50 text-sky-800 shadow-xs border border-sky-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className={isActive ? 'text-sky-700' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  <span
                    className={`ml-1 text-xs px-1.5 py-0.2 rounded-full font-mono ${
                      isActive
                        ? 'bg-sky-200/80 text-sky-900'
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
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Google Drive SaaS Integration Pill */}
            {onDriveConfigClick && (
              <button
                type="button"
                onClick={onDriveConfigClick}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium border transition cursor-pointer ${
                  isDriveConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
                title="Configure Google Drive storage for high-volume photos (30-80+) & videos"
              >
                <HardDrive className={`w-3.5 h-3.5 ${isDriveConnected ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">{isDriveConnected ? 'Drive Active' : 'Google Drive'}</span>
                <span className="sm:hidden">Drive</span>
                {isDriveConnected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse hidden sm:inline-block" />
                )}
              </button>
            )}

            {/* 1 Master Google Spreadsheet Button (4 Tabs) */}
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
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 transition shadow-2xs cursor-pointer"
                title={`Open Master Google Sheet: 4 tabs (Compliance_Jobs, Vehicles, RAW_Workshops, Model_Reports)`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span className="hidden sm:inline">Master Sheet</span>
                <span className="sm:hidden">Sheet</span>
              </button>
            )}

            {/* Sync All 4 Tables to Master Sheet */}
            {isDriveConnected && onSyncAllToSheets && (
              <button
                type="button"
                onClick={onSyncAllToSheets}
                disabled={isSyncingSheets}
                className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 transition disabled:opacity-50 cursor-pointer"
                title="Sync all 4 tables (Compliance_Jobs, Vehicles, RAW_Workshops, Model_Reports) to Master Google Sheet"
              >
                <RefreshCw className={`w-3 h-3 text-sky-600 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span>{isSyncingSheets ? 'Syncing...' : 'Sync Sheet'}</span>
              </button>
            )}

            {/* Database State Badge */}
            <div
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-mono font-medium transition cursor-pointer ${
                isSheetsPrimary
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                  : isConnected
                  ? 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
                  : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
              }`}
              onClick={() => onToggleDbMode && onToggleDbMode(!isSheetsPrimary)}
              title={
                isSheetsPrimary
                  ? 'Google Sheets is your primary database (Supabase disconnected). Click to toggle mode.'
                  : isConnected
                  ? 'Supabase live. Click to switch to Google Sheets Master Database.'
                  : 'Supabase offline. Click to switch to Google Sheets Master Database.'
              }
            >
              {isSheetsPrimary ? (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden sm:inline">Sheet DB Live</span>
                  <span className="sm:hidden">Sheet DB</span>
                </>
              ) : isConnected ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="hidden sm:inline">Supabase Live</span>
                  <span className="sm:hidden">Live</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
                  <span>Use Sheet DB</span>
                </>
              )}
            </div>

            <button
              onClick={onNewJobClick}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs sm:text-sm font-semibold rounded-md shadow-xs transition shrink-0"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>New Job</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Strip (visible below md screen) */}
        <div className="md:hidden flex items-center gap-1.5 overflow-x-auto py-2 border-t border-slate-100 -mx-3 px-3 scrollbar-none">
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

