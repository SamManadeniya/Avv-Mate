import React, { useState, useEffect } from 'react';
import { 
  X, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  FolderTree, 
  Key, 
  HelpCircle,
  RefreshCw,
  LogOut,
  FolderCheck,
  ShieldCheck,
  Zap,
  FileSpreadsheet,
  ExternalLink,
  Check
} from 'lucide-react';
import { googleDriveService, type GoogleDriveConfig } from '../../services/googleDriveService';
import { googleSheetsService } from '../../services/googleSheetsService';

interface GoogleDriveConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: GoogleDriveConfig) => void;
}

export const GoogleDriveConfigModal: React.FC<GoogleDriveConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const [config, setConfig] = useState<GoogleDriveConfig>(googleDriveService.getConfig());
  const [clientId, setClientId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [rootFolderInput, setRootFolderInput] = useState('');
  const [storageMode, setStorageMode] = useState<'google_drive' | 'supabase_only' | 'hybrid'>('google_drive');
  
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    user?: string;
    storageUsed?: string;
    rootFolderName?: string;
  } | null>(null);

  const [showHelp, setShowHelp] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sheetsPrimaryState, setSheetsPrimaryState] = useState(() => googleSheetsService.isSheetsPrimary());

  useEffect(() => {
    if (!isOpen) return;
    const c = googleDriveService.getConfig();
    setConfig(c);
    setClientId(c.clientId || '');
    setAccessToken(c.accessToken || '');
    setRootFolderInput(c.rootFolderId || '');
    setStorageMode(c.storageMode || 'google_drive');
    setSheetsPrimaryState(googleSheetsService.isSheetsPrimary());
    setTestResult(null);
    setSaveSuccess(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const cleanRoot = googleDriveService.cleanFolderId(rootFolderInput);
    googleDriveService.saveConfig({ rootFolderId: cleanRoot });

    try {
      if (!accessToken.trim() && !config.accessToken) {
        throw new Error('Please click "Authorize Google Account" or paste an Access Token first.');
      }

      // Temporarily test with the provided inputs
      const result = await googleDriveService.testConnection(accessToken.trim() || undefined);
      
      setTestResult({
        success: true,
        message: `Successfully connected to Google Drive!`,
        user: `${result.user.displayName} (${result.user.emailAddress})`,
        storageUsed: result.quota.usage ? `${Math.round(Number(result.quota.usage) / 1024 / 1024 / 1024 * 10) / 10} GB` : undefined,
        rootFolderName: result.rootFolderName,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed. Please check credentials and permissions.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleGoogleOAuthLogin = async () => {
    if (!clientId.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter your Google OAuth Client ID before connecting.',
      });
      return;
    }

    setIsAuthenticating(true);
    setTestResult(null);

    try {
      const { accessToken: newToken } = await googleDriveService.requestOAuthToken(clientId.trim());
      setAccessToken(newToken);

      // Verify connection immediately
      const test = await googleDriveService.testConnection(newToken);
      setConfig(googleDriveService.getConfig());

      setTestResult({
        success: true,
        message: 'Google Account linked successfully!',
        user: `${test.user.displayName} (${test.user.emailAddress})`,
        rootFolderName: test.rootFolderName,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Google authorization failed.',
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDirectRedirectAuth = () => {
    if (!clientId.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter your Google OAuth Client ID first.',
      });
      return;
    }
    // Save current values so they are preserved after redirect
    googleDriveService.saveConfig({
      clientId: clientId.trim(),
      rootFolderId: googleDriveService.cleanFolderId(rootFolderInput),
      storageMode,
    });
    try {
      const url = googleDriveService.getDirectAuthUrl(clientId.trim());
      window.location.href = url;
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Failed to start authorization redirect.',
      });
    }
  };

  const handleDisconnect = () => {
    googleDriveService.saveConfig({
      accessToken: undefined,
      tokenExpiresAt: undefined,
      userEmail: undefined,
      userName: undefined,
      enabled: false,
    });
    setAccessToken('');
    setConfig(googleDriveService.getConfig());
    setTestResult(null);
  };

  const handleSave = () => {
    const cleanRoot = googleDriveService.cleanFolderId(rootFolderInput);
    const updated = googleDriveService.saveConfig({
      enabled: storageMode !== 'supabase_only',
      clientId: clientId.trim(),
      accessToken: accessToken.trim() || undefined,
      rootFolderId: cleanRoot,
      storageMode,
    });

    setConfig(updated);
    setSaveSuccess(true);
    onConfigSaved?.(updated);

    setTimeout(() => {
      onClose();
    }, 800);
  };

  const handleEnableDemoMode = () => {
    const updated = googleDriveService.saveConfig({
      enabled: true,
      clientId: 'demo-client-id.apps.googleusercontent.com',
      accessToken: 'demo_mock_token_for_preview',
      rootFolderId: 'AVV_MATE_DEMO_DRIVE',
      rootFolderName: 'AVV Compliance Root (Demo)',
      userEmail: 'operations@avvcompliance.com.au',
      userName: 'AVV Compliance Operator',
      storageMode: 'google_drive',
    });
    setConfig(updated);
    setClientId(updated.clientId);
    setAccessToken(updated.accessToken || '');
    setRootFolderInput(updated.rootFolderId || '');
    setTestResult({
      success: true,
      message: 'Demo Drive storage enabled! Folder structures and simulated uploads are active.',
      user: 'AVV Compliance Operator (operations@avvcompliance.com.au)',
      rootFolderName: 'AVV Compliance Root (Demo)',
    });
  };

  const isDriveActive = Boolean(config.accessToken || accessToken);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-display tracking-tight text-white">
                  Google Drive Storage Setup
                </h2>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  SaaS Multi-Tenant
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Connect external Google Drive for 30–80+ compliance photos & high-definition inspection videos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Storage Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 font-display">
              Select Primary Storage Engine
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setStorageMode('google_drive')}
                className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                  storageMode === 'google_drive'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="mt-0.5 p-1.5 rounded-md bg-emerald-100 text-emerald-700 shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">Google Drive Storage</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">Recommended</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Zero bandwidth caps. Handles 30–80+ photos per car, gigabyte inspection videos, and creates native folder trees automatically.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setStorageMode('supabase_only')}
                className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                  storageMode === 'supabase_only'
                    ? 'border-sky-500 bg-sky-50/50 ring-1 ring-sky-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="mt-0.5 p-1.5 rounded-md bg-sky-100 text-sky-700 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900">Supabase Bucket Only</span>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Stores standard 7 PDFs in Supabase <code className="text-[10px] font-mono bg-slate-100 px-1 py-0.5 rounded">compliance-docs</code> bucket.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Google Credentials Configuration */}
          {storageMode !== 'supabase_only' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 font-display">
                  <Key className="w-3.5 h-3.5 text-emerald-600" />
                  Google Workspace / Drive Credentials
                </span>

                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className="text-xs text-sky-700 hover:text-sky-800 flex items-center gap-1 font-medium"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{showHelp ? 'Hide Setup Guide' : 'How to get Client ID'}</span>
                </button>
              </div>

              {showHelp && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-900 space-y-1.5 animate-in fade-in duration-150">
                  <p className="font-bold">Simple 3-step Google Cloud Setup for your Company:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                    <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline font-semibold">Google Cloud Console &rarr; Credentials</a>.</li>
                    <li>Create an <strong>OAuth 2.0 Client ID</strong> (Application type: <em>Web application</em>).</li>
                    <li>Add your domain (e.g. <code className="bg-sky-100 px-1 py-0.5 rounded font-mono">https://avvmate.netlify.app</code> or <code className="bg-sky-100 px-1 py-0.5 rounded font-mono">http://localhost:5173</code>) under <strong>Authorized JavaScript origins</strong>.</li>
                  </ol>
                  <p className="text-[11px] text-slate-500 pt-1">
                    Or click <strong>"Try Demo Mode"</strong> below to test the automated hierarchy immediately.
                  </p>
                </div>
              )}

              {/* OAuth Client ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google OAuth 2.0 Client ID
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                      placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleGoogleOAuthLogin}
                      disabled={isAuthenticating}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-2xs transition flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                      title="Authorize using Google popup window"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isAuthenticating ? 'Waiting popup…' : 'Authorize (Popup)'}</span>
                    </button>
                  </div>

                  {/* Guaranteed Full-Screen Redirect Button */}
                  <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                    <div className="text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800">Safari blocking popups?</span> Use direct full-screen sign-in:
                    </div>
                    <button
                      type="button"
                      onClick={handleDirectRedirectAuth}
                      className="px-3 py-1 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded transition shadow-2xs shrink-0 flex items-center gap-1"
                    >
                      <span>Sign In Full-Screen (No Popups) &rarr;</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Connected Account Card if token exists */}
              {isDriveActive && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-950">
                        {config.userName || 'Google Account Linked'}
                      </p>
                      <p className="text-[11px] text-emerald-700 font-mono">
                        {config.userEmail || 'Active OAuth Session'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-2 py-1 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" /> Disconnect
                  </button>
                </div>
              )}

              {/* Manual Access Token / Service Account override */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  OAuth Access Token / Service Account Bearer (Auto-filled on authorize or paste custom)
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder="ya29.a0AfH6SMB..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Target Parent / Root Folder ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Root Parent Folder URL or ID (Optional)
                </label>
                <input
                  type="text"
                  value={rootFolderInput}
                  onChange={e => setRootFolderInput(e.target.value)}
                  placeholder="Paste URL (e.g. https://drive.google.com/drive/folders/1aBc...) or leave blank for My Drive"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  All vehicle folders (<code className="font-bold text-slate-700">SVC1028</code>, etc.) will be created inside this folder.
                </p>
              </div>
            </div>
          )}

          {/* Master Google Spreadsheet Database Architecture Card */}
          <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5 font-display">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                1 Master Google Sheet • 4 Database Tabs
              </span>
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                Auto-Synced in AVV Mate Drive
              </span>
            </div>

            <p className="text-xs text-emerald-900 leading-relaxed">
              Consolidates all system data into a single spreadsheet named <strong className="font-semibold text-emerald-950">AVV Mate Master Database</strong> with 4 dedicated tabs:
              <br />
              <span className="font-mono text-[11px] text-emerald-800">
                📑 Compliance_Jobs • 📑 Vehicles • 📑 RAW_Workshops • 📑 Model_Reports
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const info = await googleSheetsService.getMasterSpreadsheet();
                    window.open(info.webViewLink, '_blank');
                  } catch (e: any) {
                    alert(e.message || 'Error opening Master Sheet');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Master Database in Drive</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextPrimary = !sheetsPrimaryState;
                  googleSheetsService.setSheetsPrimary(nextPrimary);
                  setSheetsPrimaryState(nextPrimary);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition cursor-pointer ${
                  sheetsPrimaryState
                    ? 'bg-emerald-200/90 text-emerald-950 border-emerald-400 font-bold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
                title="Bypass Supabase completely and use Google Sheets as primary database"
              >
                <Check className={`w-3.5 h-3.5 ${sheetsPrimaryState ? 'text-emerald-800' : 'text-slate-400'}`} />
                <span>{sheetsPrimaryState ? 'Sheets DB Active (Supabase Bypassed)' : 'Enable Sheets as Primary DB'}</span>
              </button>
            </div>
          </div>

          {/* Automated Folder Hierarchy Visualizer */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 font-display">
                <FolderTree className="w-3.5 h-3.5 text-sky-700" />
                Automated Google Drive Architecture
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                1 Root Folder Structure
              </span>
            </div>

            <div className="font-mono text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <FolderCheck className="w-4 h-4 text-emerald-600" />
                <span>📁 {rootFolderInput ? (googleDriveService.cleanFolderId(rootFolderInput).slice(0, 16) + '…') : 'AVV Mate Drive'}</span>
              </div>
              <div className="pl-5 flex items-center gap-1.5 text-emerald-800 font-bold">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>📊 AVV Mate Master Database (Google Sheet: 4 Tabs)</span>
              </div>
              <div className="pl-10 text-[10px] text-slate-500 space-y-0.5">
                <div>├── 📑 Tab 1: Compliance_Jobs (Folder #, VIN, RAW ID, Workshop, MRE, Status, Drive Link)</div>
                <div>├── 📑 Tab 2: Vehicles (VIN, Build Date, VIA #, Make, Model)</div>
                <div>├── 📑 Tab 3: RAW_Workshops (RAW ID, Name, State, Contact, Email)</div>
                <div>└── 📑 Tab 4: Model_Reports (MRE #, Make, Model, SEV #)</div>
              </div>
              <div className="pl-5 flex items-center gap-1.5 text-sky-800 font-bold pt-1">
                <span>└── 📁 SVC1028 (Vehicle Folder)</span>
              </div>
              <div className="pl-10 flex items-center gap-1.5 text-slate-600">
                <span>├── 📁 DOCS</span>
                <span className="text-[10px] font-sans text-slate-400">(CRE, EC, CIN, WI, DC, VI, RAW DECLA)</span>
              </div>
              <div className="pl-10 flex items-center gap-1.5 text-slate-600 font-semibold">
                <span>└── 📁 MEDIA</span>
              </div>
              <div className="pl-16 flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span>├── 📁 PHOTOS</span>
                <span className="text-[10px] font-sans text-emerald-600">(30–80+ batch vehicle photos)</span>
              </div>
              <div className="pl-16 flex items-center gap-1.5 text-sky-700 font-semibold">
                <span>├── 📁 VIDEOS</span>
                <span className="text-[10px] font-sans text-sky-600">(Inspection videos)</span>
              </div>
              <div className="pl-16 flex items-center gap-1.5 text-slate-500">
                <span>└── 📁 SUBMIT</span>
                <span className="text-[10px] font-sans text-slate-400">(Auto-created, empty package ready)</span>
              </div>
            </div>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 animate-in fade-in duration-150 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-bold">{testResult.message}</p>
                {testResult.user && (
                  <p className="text-[11px] text-emerald-700">Account: {testResult.user}</p>
                )}
                {testResult.rootFolderName && (
                  <p className="text-[11px] text-emerald-700">Root Folder: {testResult.rootFolderName}</p>
                )}
                {testResult.storageUsed && (
                  <p className="text-[11px] text-emerald-700">Storage Used: {testResult.storageUsed}</p>
                )}
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Configuration saved successfully!</span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnableDemoMode}
              className="px-3 py-1.5 border border-dashed border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-md transition flex items-center gap-1.5"
              title="Activate instant demo mode for client presentation & testing"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Try Demo Mode</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-100 transition"
            >
              Cancel
            </button>

            {storageMode !== 'supabase_only' && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-md transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Testing…' : 'Test Connection'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow-2xs transition"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
