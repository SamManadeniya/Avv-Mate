import React from 'react';
import { 
  Car, 
  Wrench, 
  FileText, 
  ShieldCheck, 
  Plus, 
  CheckCircle, 
  AlertCircle
} from 'lucide-react';

export type ActiveTab = 'jobs' | 'vehicles' | 'workshops' | 'reports';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onNewJobClick: () => void;
  counts: {
    jobs: number;
    vehicles: number;
    workshops: number;
    reports: number;
  };
  isConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onNewJobClick,
  counts,
  isConnected,
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
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-800 flex items-center justify-center text-white font-display font-bold text-xl shadow">
              AV
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-xl tracking-tight text-slate-900">
                  AVV MATE
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-sky-100 text-sky-800">
                  RVSA / ROVER
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Authorised Vehicle Verifier & Compliance Workbench
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1">
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
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {isConnected ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Supabase Live</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                  <span>Offline</span>
                </>
              )}
            </div>

            <button
              onClick={onNewJobClick}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold rounded-md shadow transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Job</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

