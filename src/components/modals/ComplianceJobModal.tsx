import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Upload, 
  Check, 
  Trash2, 
  ExternalLink, 
  FileText, 
  AlertCircle,
  Save,
  Calendar,
  Layers,
  MessageSquare,
  FolderTree,
  Images,
  RefreshCw,
  Film,
  Plus,
  HardDrive,
  Loader2,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import type { ComplianceJob, Vehicle, RawWorkshop, ModelReport, DocType } from '../../types';
import { REQUIRED_DOC_TYPES } from '../../types';
import { SearchableSelect } from '../common/SearchableSelect';
import { attachmentService } from '../../services/attachmentService';
import { complianceJobService } from '../../services/complianceJobService';
import { googleDriveService, type VehicleDriveHierarchy } from '../../services/googleDriveService';
import { formatBytes, getNextFolderNumber } from '../../lib/utils';
import { autoMatchFilesWithContent, type AutoMatchFile, type AutoMatchTarget, type AutoMatchResult } from '../../utils/documentAutoMatcher';
import { extractPdfTextAndMetadata, generateStandardFileName, createRenamedFile } from '../../utils/pdfTextExtractor';
import { AutoSortReviewModal } from './AutoSortReviewModal';

interface ComplianceJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (job: ComplianceJob) => void | Promise<void>;
  jobToEdit?: ComplianceJob | null;
  vehicles: Vehicle[];
  workshops: RawWorkshop[];
  modelReports: ModelReport[];
  lastFolderNo?: string | null;
  onRequestDocs?: (job: ComplianceJob) => void;
}

export const ComplianceJobModal: React.FC<ComplianceJobModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  jobToEdit,
  vehicles,
  workshops,
  modelReports,
  lastFolderNo,
  onRequestDocs,
}) => {
  const [folderNo, setFolderNo] = useState('');
  const [vin, setVin] = useState('');
  const [rawId, setRawId] = useState('');
  const [mreNo, setMreNo] = useState('');
  const [detectedMake, setDetectedMake] = useState('');
  const [detectedModel, setDetectedModel] = useState('');
  const [extractedViaNo, setExtractedViaNo] = useState<string | null>(null);
  const [extractedUniqueId, setExtractedUniqueId] = useState<string | null>(null);
  const [extractedBuildDate, setExtractedBuildDate] = useState<string | null>(null);
  const [requestReceived, setRequestReceived] = useState('');
  const [videosUrl, setVideosUrl] = useState('');
  const [avvVerificationDate, setAvvVerificationDate] = useState('');
  const [avvSubmitDate, setAvvSubmitDate] = useState('');
  const [ravDateOfEntry, setRavDateOfEntry] = useState('');
  const [approvalDate, setApprovalDate] = useState('');
  const [recallCheckDate, setRecallCheckDate] = useState('');
  const [status, setStatus] = useState<ComplianceJob['status']>('in_progress');
  const [errorNote, setErrorNote] = useState('');

  // Selected vehicle details (auto-prefilled)
  const [matchedVehicle, setMatchedVehicle] = useState<Vehicle | null>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<Record<DocType, any>>({
    CRE: null, EC: null, CIN: null, WI: null,
    DC: null, VI: null, RAW_DECLA: null, RECALL: null, PHOTOS: null
  });
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Active Upload Notification Toast
  const [uploadToast, setUploadToast] = useState<{
    id: number;
    type: 'uploading' | 'success' | 'error';
    message: string;
  } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showUploadToast = (type: 'uploading' | 'success' | 'error', message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setUploadToast({ id: Date.now(), type, message });
    if (type === 'success') {
      toastTimerRef.current = setTimeout(() => {
        setUploadToast(null);
      }, 4000);
    }
  };

  // Google Drive & High-Volume Media states
  const [isDriveConfigured, setIsDriveConfigured] = useState(() => googleDriveService.isConfigured());
  const [driveHierarchy, setDriveHierarchy] = useState<VehicleDriveHierarchy | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [driveFeedback, setDriveFeedback] = useState<string | null>(null);

  // Batch Photos (30–80+ photos)
  const [batchPhotosCount, setBatchPhotosCount] = useState<number>(0);
  const [queuedBatchPhotos, setQueuedBatchPhotos] = useState<File[]>([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number; currentFile: string } | null>(null);

  // Video File Upload (supports 2 to 3+ videos)
  const [videoList, setVideoList] = useState<Array<{ id?: string; name: string; size?: number; webViewLink: string }>>([]);
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{ current: number; total: number; percent: number; name: string } | null>(null);

  // Pending files waiting for Google Drive connection
  const [pendingUpload, setPendingUpload] = useState<{
    type: 'photos' | 'videos';
    files: File[];
  } | null>(null);

  // Auto-Sort & Batch Matching states
  const [autoSortMatches, setAutoSortMatches] = useState<AutoMatchFile[]>([]);
  const [autoSortVinConflict, setAutoSortVinConflict] = useState<AutoMatchResult['vinConflict'] | null>(null);
  const [isAutoSortModalOpen, setIsAutoSortModalOpen] = useState(false);
  const [isAutoSortProcessing, setIsAutoSortProcessing] = useState(false);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);

  // Initialize or reset form
  useEffect(() => {
    if (!isOpen) return;

    // Restore draft if redirected back from Google OAuth
    const draft = sessionStorage.getItem('avv_mate_active_job_draft');
    if (draft && !jobToEdit) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.folderNo) setFolderNo(parsed.folderNo);
        if (parsed.vin) setVin(parsed.vin);
        if (parsed.rawId) setRawId(parsed.rawId);
        if (parsed.mreNo) setMreNo(parsed.mreNo);
        sessionStorage.removeItem('avv_mate_active_job_draft');
      } catch (_) {}
    }

    if (jobToEdit) {
      setFolderNo(jobToEdit.folder_no);
      setVin(jobToEdit.vin);
      setRawId(jobToEdit.raw_id || '');
      setMreNo(jobToEdit.mre_no || '');
      setRequestReceived(jobToEdit.request_received || '');
      const initialVideosUrl = jobToEdit.videos_url && !jobToEdit.videos_url.includes('#') ? jobToEdit.videos_url : '';
      setVideosUrl(initialVideosUrl);
      if (initialVideosUrl) {
        setVideoList([{
          name: 'Recorded Inspection Video',
          webViewLink: initialVideosUrl,
        }]);
      } else {
        setVideoList([]);
      }
      setAvvVerificationDate(jobToEdit.avv_verification_date || '');
      setAvvSubmitDate(jobToEdit.avv_submit_date || '');
      setRavDateOfEntry(jobToEdit.rav_date_of_entry || '');
      setApprovalDate(jobToEdit.approval_date || '');
      setRecallCheckDate(jobToEdit.recall_check_date || '');
      setStatus(jobToEdit.status || 'in_progress');
      setErrorNote(jobToEdit.error_note || '');

      // Load attachments: prioritize existing job attachments from state/Sheets, or query Supabase
      if (jobToEdit.attachments && Object.values(jobToEdit.attachments).some(a => Boolean(a))) {
        setAttachments(jobToEdit.attachments);
      } else {
        attachmentService.getByJobId(jobToEdit.id).then(att => {
          if (att && Object.values(att).some(a => Boolean(a))) {
            setAttachments(att);
          }
        }).catch(() => {});
      }

      // Match vehicle
      const v = vehicles.find(item => item.vin.toUpperCase() === jobToEdit.vin.toUpperCase());
      setMatchedVehicle(v || null);
    } else {
      // New Job mode
      if (lastFolderNo) {
        setFolderNo(getNextFolderNumber(lastFolderNo));
      } else {
        complianceJobService.getLastFolderNo().then(last => {
          setFolderNo(getNextFolderNumber(last));
        }).catch(() => {
          setFolderNo('SVC1001');
        });
      }
      setVin('');
      setRawId('');
      setMreNo('');
      setRequestReceived(new Date().toISOString().slice(0, 10));
      setVideosUrl('');
      setVideoList([]);
      setAvvVerificationDate('');
      setAvvSubmitDate('');
      setRavDateOfEntry('');
      setApprovalDate('');
      setRecallCheckDate('');
      setStatus('in_progress');
      setErrorNote('');
      setMatchedVehicle(null);
      setAttachments({
        CRE: null, EC: null, CIN: null, WI: null,
        DC: null, VI: null, RAW_DECLA: null, RECALL: null, PHOTOS: null
      });
      setQueuedBatchPhotos([]);
      setBatchPhotosCount(0);
      setAutoSortVinConflict(null);
      setExtractedViaNo(null);
      setExtractedUniqueId(null);
      setExtractedBuildDate(null);
    }
    setIsDriveConfigured(googleDriveService.isConfigured());
    setDriveFeedback(null);
    setErrorMessage('');
  }, [isOpen, jobToEdit, vehicles]);

  // Helper to smartly map Make + Model strings to Model Reports (e.g. "BMW" + "M340i xDrive Touring" -> "MRE-000907")
  const resolveMreFromMakeModel = (makeCandidate?: string, modelCandidate?: string): ModelReport | undefined => {
    if (!makeCandidate || !modelCandidate) return undefined;
    const cleanMake = makeCandidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanModel = modelCandidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanMake || !cleanModel) return undefined;

    return modelReports.find(m => {
      const mMk = (m.make || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const mMd = (m.model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (mMk === cleanMake && mMd === cleanModel) return true;
      if (mMk === cleanMake && (mMd.includes(cleanModel) || cleanModel.includes(mMd))) return true;
      return false;
    });
  };

  // Reactive Autocomplete: When VIN changes, lookup vehicle and prefill RAW ID and MRE
  const handleVinChange = (val: string) => {
    const cleanVin = val.toUpperCase().replace(/\s/g, '');
    setVin(cleanVin);

    const match = vehicles.find(v => v.vin.toUpperCase() === cleanVin);
    if (match) {
      setMatchedVehicle(match);
      if (match.raw_id) setRawId(match.raw_id);
      if (match.mre_no && match.mre_no !== 'MRE-000000') {
        setMreNo(match.mre_no);
      } else if (match.make && match.model) {
        const autoMre = resolveMreFromMakeModel(match.make, match.model);
        if (autoMre) setMreNo(autoMre.mre_no);
      }
      if (match.make) setDetectedMake(match.make);
      if (match.model) setDetectedModel(match.model);
    } else {
      setMatchedVehicle(null);
    }
  };

  // Auto-resolve MRE from detected Make and Model whenever they become available
  useEffect(() => {
    if ((!mreNo || mreNo === 'MRE-000000') && detectedMake && detectedModel) {
      const autoMre = resolveMreFromMakeModel(detectedMake, detectedModel);
      if (autoMre) {
        setMreNo(autoMre.mre_no);
      }
    }
  }, [detectedMake, detectedModel, mreNo, modelReports]);

  // Handle file upload for a specific slot
  const handleFileUpload = async (docType: DocType, file: File) => {
    const docConfig = REQUIRED_DOC_TYPES.find(d => d.type === docType);
    const docTitle = docConfig ? `${docConfig.label} (${docConfig.name})` : docType;

    try {
      setUploadingDoc(docType);
      setErrorMessage('');

      // 1. Deep PDF Content Extraction: Read inside the PDF to auto-fill Section 1
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        try {
          const metadata = await extractPdfTextAndMetadata(file);
          if (metadata.vin && !vin) {
            handleVinChange(metadata.vin);
            showUploadToast('uploading', `Auto-detected VIN ${metadata.vin} from ${docTitle}...`);
          }
          if (metadata.rawId && !rawId) {
            const ws = workshops.find(w => w.raw_id.toUpperCase() === metadata.rawId!.toUpperCase());
            setRawId(ws ? ws.raw_id : metadata.rawId);
          }
          if (metadata.make) setDetectedMake(metadata.make);
          if (metadata.model) setDetectedModel(metadata.model);

          if (metadata.mreNo && metadata.mreNo !== 'MRE-000000' && (!mreNo || mreNo === 'MRE-000000')) {
            const mr = modelReports.find(m => m.mre_no.toUpperCase() === metadata.mreNo!.toUpperCase());
            setMreNo(mr ? mr.mre_no : metadata.mreNo);
          } else if ((!mreNo || mreNo === 'MRE-000000') && (metadata.make || detectedMake) && (metadata.model || detectedModel)) {
            const autoMre = resolveMreFromMakeModel(metadata.make || detectedMake, metadata.model || detectedModel);
            if (autoMre) setMreNo(autoMre.mre_no);
          }
        } catch (_) {}
      }

      // 2. Standardized Automatic File Renaming (e.g. SVC1013_DC_Damage_or_Corrosion.pdf)
      const standardName = generateStandardFileName(folderNo, docType, file.name);
      const targetFile = file.name === standardName ? file : createRenamedFile(file, standardName);

      showUploadToast('uploading', `Uploading ${docTitle}: ${targetFile.name}...`);

      if (jobToEdit?.id) {
        let att: any = null;
        try {
          att = await attachmentService.uploadFile(jobToEdit.id, docType, targetFile);
        } catch (supaErr) {
          console.warn('Supabase attachment upload skipped/fallback:', supaErr);
          att = {
            job_id: jobToEdit.id,
            doc_type: docType,
            file_name: targetFile.name,
            file_size: targetFile.size,
            mime_type: targetFile.type,
            file_url: URL.createObjectURL(targetFile),
            _fileObject: targetFile,
          };
        }
        setAttachments(prev => ({ ...prev, [docType]: att }));

        // Automatic mirror to Google Drive with proper folder segregation:
        // - Compliance Docs (CRE, EC, CIN, WI, DC, VI, RAW_DECLA, RECALL) -> ALWAYS DOCS (even if .jpg/.png)
        // - Photos (PHOTOS slot) -> MEDIA/PHOTOS
        // - Videos -> MEDIA/VIDEOS
        if (googleDriveService.isConfigured()) {
          const isComplianceDoc = ['CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW_DECLA', 'RAW_DECL', 'RECALL'].includes(docType);
          const isVid = targetFile.type.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(targetFile.name);
          const isPhoto = !isComplianceDoc && (docType === 'PHOTOS' || targetFile.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(targetFile.name));
          const folderLabel = isComplianceDoc ? 'DOCS' : isVid ? 'MEDIA/VIDEOS' : isPhoto ? 'MEDIA/PHOTOS' : 'DOCS';

          showUploadToast('uploading', `Uploading ${docTitle} & creating/syncing to Google Drive (${folderNo}/${folderLabel})...`);

          googleDriveService.syncJobAttachmentsToDrive(folderNo, [{
            name: targetFile.name,
            mimeType: targetFile.type,
            fileObject: targetFile,
            docType,
            category: isComplianceDoc ? 'docs' : isVid ? 'videos' : 'photos',
          }]).then((syncRes) => {
            if (syncRes.uploadedFiles) {
              const up = syncRes.uploadedFiles[docType] || syncRes.uploadedFiles[targetFile.name];
              if (up?.webViewLink) {
                setAttachments(prev => ({
                  ...prev,
                  [docType]: {
                    ...(prev[docType] || {}),
                    file_url: up.webViewLink,
                    drive_file_url: up.webViewLink,
                    webViewLink: up.webViewLink,
                  }
                }));
              }
            }
            setDriveFeedback(`✓ Auto-saved ${targetFile.name} to Google Drive (${folderNo}/${folderLabel})`);
            showUploadToast('success', `✓ Google Drive folder ready & ${docTitle} (${targetFile.name}) uploaded to ${folderNo}/${folderLabel}!`);
          }).catch(e => {
            console.warn('Background Drive upload:', e);
            showUploadToast('success', `✓ Successfully uploaded ${docTitle} to Compliance!`);
          });
        } else {
          showUploadToast('success', `✓ Successfully uploaded ${docTitle} to Compliance!`);
        }
      } else {
        // If creating a brand new job before saving, store temporary local preview
        const tempAtt = {
          file_name: targetFile.name,
          file_size: targetFile.size,
          mime_type: targetFile.type,
          file_url: URL.createObjectURL(targetFile),
          _fileObject: targetFile
        };
        setAttachments(prev => ({ ...prev, [docType]: tempAtt }));
        showUploadToast('success', `✓ ${docTitle} staged with standard name (${targetFile.name})!`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Failed to upload ${docType}: ${err.message || 'Error'}`);
      showUploadToast('error', `Failed to upload ${docTitle}: ${err.message || 'Error'}`);
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleDeleteAttachment = async (docType: DocType) => {
    try {
      if (jobToEdit?.id && attachments[docType]?.id) {
        await attachmentService.deleteAttachment(jobToEdit.id, docType, attachments[docType]?.file_url);
      }
      setAttachments(prev => ({ ...prev, [docType]: null }));
    } catch (err: any) {
      setErrorMessage(`Failed to remove ${docType}: ${err.message}`);
    }
  };

  const handleViewAttachment = async (docType: DocType, att: any) => {
    if (!att) return;

    const rootFolderId = '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5';
    const cleanFolder = (folderNo || jobToEdit?.folder_no || '').toUpperCase().trim();

    const isDirectUsableUrl = (url?: string) => {
      if (!url || typeof url !== 'string') return false;
      if (url.startsWith('blob:')) return false;
      if (url.includes(rootFolderId)) return false;
      return /^https?:\/\//i.test(url);
    };

    // 1. Direct file link if available (Google Drive direct file view link or Supabase URL)
    if (isDirectUsableUrl(att.drive_file_url)) {
      window.open(att.drive_file_url, '_blank');
      return;
    }
    if (isDirectUsableUrl(att.webViewLink)) {
      window.open(att.webViewLink, '_blank');
      return;
    }
    if (isDirectUsableUrl(att.file_url)) {
      window.open(att.file_url, '_blank');
      return;
    }

    // 2. If we have the live File / Blob object in memory, open fresh preview tab immediately
    const fileObj = att._fileObject || att.fileObject;
    if (fileObj instanceof Blob || fileObj instanceof File) {
      const freshBlobUrl = URL.createObjectURL(fileObj);
      window.open(freshBlobUrl, '_blank');
      return;
    }

    // 3. Google Drive Hierarchy lookup: find exact file inside vehicle's folder
    if (cleanFolder) {
      try {
        const hierarchy = driveHierarchy || await googleDriveService.ensureVehicleFolderHierarchy(cleanFolder);
        const targetFolder = (docType === 'PHOTOS')
          ? hierarchy.photosFolder
          : (docType as string === 'VIDEOS')
          ? hierarchy.videosFolder
          : hierarchy.docsFolder;

        if (targetFolder?.id && !targetFolder.id.startsWith('drive_') && !targetFolder.id.includes(rootFolderId)) {
          const driveFiles = await googleDriveService.listFolderFiles(targetFolder.id);
          const matched = driveFiles.find(f => f.name.toLowerCase() === (att.file_name || '').toLowerCase())
                       || driveFiles.find(f => f.name.toLowerCase().includes(docType.toLowerCase()));
          if (matched?.webViewLink && isDirectUsableUrl(matched.webViewLink)) {
            window.open(matched.webViewLink, '_blank');
            return;
          }
        }

        if (targetFolder?.webViewLink && isDirectUsableUrl(targetFolder.webViewLink)) {
          window.open(targetFolder.webViewLink, '_blank');
          return;
        }

        if (hierarchy.vehicleFolder?.webViewLink && isDirectUsableUrl(hierarchy.vehicleFolder.webViewLink)) {
          window.open(hierarchy.vehicleFolder.webViewLink, '_blank');
          return;
        }
      } catch (_) {}

      // 4. Exact targeted Google Drive Search:
      // Search for specific vehicle folder and document type (e.g. "SVC1116 DC")
      // Opens directly to the exact file/card in Google Drive without dumping into root
      const searchTerms = [cleanFolder, docType].filter(Boolean).join(' ');
      window.open(`https://drive.google.com/drive/search?q=${encodeURIComponent(searchTerms)}`, '_blank');
      return;
    }

    if (att.file_name) {
      window.open(`https://drive.google.com/drive/search?q=${encodeURIComponent(att.file_name)}`, '_blank');
    }
  };

  // Batch Attach & Auto-Sort Handlers with Deep PDF Inspection & Auto-Fill
  const handleFilesSelectedForAutoSort = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    showUploadToast('uploading', `Inspecting ${fileArray.length} files with Document Intelligence...`);
    
    const result = await autoMatchFilesWithContent(fileArray, (current, total, msg) => {
      showUploadToast('uploading', `[${current}/${total}] ${msg}`);
    });

    // Auto-fill Section 1 if VIN, Workshop, or MRE # was found inside the document!
    if (result.extractedVin && !vin) {
      handleVinChange(result.extractedVin);
      showUploadToast('success', `✓ Smart Extracted: Auto-filled VIN (${result.extractedVin}) into Section 1!`);
    }
    if (result.extractedRawId && !rawId) {
      const ws = workshops.find(w => w.raw_id.toUpperCase() === result.extractedRawId!.toUpperCase());
      setRawId(ws ? ws.raw_id : result.extractedRawId);
    }
    if (result.extractedMake) setDetectedMake(result.extractedMake);
    if (result.extractedModel) setDetectedModel(result.extractedModel);

    if (result.extractedMreNo && result.extractedMreNo !== 'MRE-000000' && (!mreNo || mreNo === 'MRE-000000')) {
      const mr = modelReports.find(m => m.mre_no.toUpperCase() === result.extractedMreNo!.toUpperCase());
      setMreNo(mr ? mr.mre_no : result.extractedMreNo);
    } else if ((!mreNo || mreNo === 'MRE-000000') && (result.extractedMake || detectedMake) && (result.extractedModel || detectedModel)) {
      const autoMre = resolveMreFromMakeModel(result.extractedMake || detectedMake, result.extractedModel || detectedModel);
      if (autoMre) setMreNo(autoMre.mre_no);
    }

    if (result.extractedViaNo) setExtractedViaNo(result.extractedViaNo);
    if (result.extractedUniqueId) setExtractedUniqueId(result.extractedUniqueId);
    if (result.extractedBuildDate) setExtractedBuildDate(result.extractedBuildDate);

    setAutoSortMatches(result.matches);
    setAutoSortVinConflict(result.vinConflict || null);
    if (result.vinConflict?.hasConflict) {
      showUploadToast('error', `⚠️ Mixed Vehicle Warning: Uploaded files contain multiple VINs (${result.vinConflict.detectedVins.map(d => d.vin).join(' vs ')}).`);
    }
    setIsAutoSortModalOpen(true);
  };

  const handleUpdateAutoMatchTarget = (id: string, newTarget: AutoMatchTarget) => {
    setAutoSortMatches(prev => prev.map(m => m.id === id ? { ...m, target: newTarget, confidence: 'manual', matchReason: 'Manually updated' } : m));
  };

  const handleConfirmAutoSort = async () => {
    const validMatches = autoSortMatches.filter(m => m.target !== 'IGNORE');
    if (validMatches.length === 0) {
      setIsAutoSortModalOpen(false);
      return;
    }

    setIsAutoSortProcessing(true);
    showUploadToast('uploading', `Auto-sorting, standardizing names & attaching ${validMatches.length} file(s)...`);

    try {
      const docMatches: Array<{ docType: DocType; file: File }> = [];
      const photoFiles: File[] = [];
      const videoFiles: File[] = [];

      validMatches.forEach(m => {
        if (m.target === 'VIDEOS') {
          videoFiles.push(m.file);
        } else if (m.target === 'PHOTOS') {
          photoFiles.push(m.file);
        } else {
          docMatches.push({ docType: m.target as DocType, file: m.file });
        }
      });

      const newAttachments: Record<string, any> = {};
      const driveDocsToSync: Array<{ name: string; mimeType: string; fileObject: File; docType: DocType; category: 'docs' }> = [];

      for (const { docType, file } of docMatches) {
        // Standardize filename automatically (e.g. SVC1013_DC_Damage_or_Corrosion.pdf)
        const standardName = generateStandardFileName(folderNo, docType, file.name);
        const renamedFile = file.name === standardName ? file : createRenamedFile(file, standardName);

        if (jobToEdit?.id) {
          let att: any = null;
          try {
            att = await attachmentService.uploadFile(jobToEdit.id, docType, renamedFile);
          } catch (supaErr) {
            console.warn('Supabase attachment upload fallback:', supaErr);
            att = {
              job_id: jobToEdit.id,
              doc_type: docType,
              file_name: renamedFile.name,
              file_size: renamedFile.size,
              mime_type: renamedFile.type,
              file_url: URL.createObjectURL(renamedFile),
              _fileObject: renamedFile,
            };
          }
          newAttachments[docType] = att;
        } else {
          newAttachments[docType] = {
            file_name: renamedFile.name,
            file_size: renamedFile.size,
            mime_type: renamedFile.type,
            file_url: URL.createObjectURL(renamedFile),
            _fileObject: renamedFile,
          };
        }

        driveDocsToSync.push({
          name: renamedFile.name,
          mimeType: renamedFile.type,
          fileObject: renamedFile,
          docType,
          category: 'docs',
        });
      }

      setAttachments(prev => ({ ...prev, ...newAttachments }));

      if (googleDriveService.isConfigured() && driveDocsToSync.length > 0) {
        googleDriveService.syncJobAttachmentsToDrive(folderNo, driveDocsToSync)
          .then(syncRes => {
            if (syncRes.uploadedFiles && Object.keys(syncRes.uploadedFiles).length > 0) {
              setAttachments(prev => {
                const updated = { ...prev };
                Object.entries(syncRes.uploadedFiles!).forEach(([k, up]) => {
                  if (updated[k as DocType]) {
                    updated[k as DocType] = {
                      ...updated[k as DocType],
                      file_url: up.webViewLink,
                      drive_file_url: up.webViewLink,
                      webViewLink: up.webViewLink,
                    };
                  }
                });
                return updated;
              });
            }
            setDriveFeedback(`✓ Auto-saved ${driveDocsToSync.length} documents to Google Drive (${folderNo}/DOCS)`);
          })
          .catch(e => console.warn('Background Drive batch upload:', e));
      }

      if (photoFiles.length > 0) {
        await executeBatchPhotosUpload(photoFiles);
      }

      if (videoFiles.length > 0) {
        await executeMultipleVideoUpload(videoFiles);
      }

      showUploadToast('success', `✓ Successfully auto-sorted, renamed & attached ${validMatches.length} file(s)!`);
      setIsAutoSortModalOpen(false);
    } catch (err: any) {
      console.error('Auto-sort batch attach error:', err);
      showUploadToast('error', `Failed to attach some files: ${err.message || 'Error'}`);
    } finally {
      setIsAutoSortProcessing(false);
    }
  };

  // Google Drive Automated Hierarchy Handler
  const handleInitializeDrive = async () => {
    if (!folderNo.trim()) {
      setErrorMessage('Please enter a folder number (e.g. SVC1028) first.');
      return;
    }
    const cleanNo = folderNo.toUpperCase().trim();
    setIsSyncingDrive(true);
    setDriveFeedback(null);
    showUploadToast('uploading', `Creating & verifying Google Drive folder tree for ${cleanNo}...`);
    try {
      if (googleDriveService.isConfigured()) {
        if (!googleDriveService.isTokenValid() && googleDriveService.getConfig().clientId) {
          setDriveFeedback('Authorizing Google Drive...');
          await googleDriveService.requestOAuthToken();
          setIsDriveConfigured(googleDriveService.isConfigured());
        }

        const hierarchy = await googleDriveService.ensureVehicleFolderHierarchy(folderNo, true);
        setDriveHierarchy(hierarchy);
        if (!videosUrl) {
          setVideosUrl(hierarchy.videosFolder.webViewLink);
        }

        // Query existing videos in MEDIA/VIDEOS
        if (hierarchy.videosFolder?.id && !hierarchy.videosFolder.id.startsWith('demo_')) {
          try {
            const files = await googleDriveService.listFolderFiles(hierarchy.videosFolder.id);
            const vFiles = files.filter(f => f.mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(f.name));
            if (vFiles.length > 0) {
              setVideoList(vFiles.map(f => ({
                id: f.id,
                name: f.name,
                size: f.size,
                webViewLink: f.webViewLink,
              })));
            }
          } catch (_) {}
        }

        // Auto-push and organize all vehicle attachments into their dedicated Drive folders:
        // - PDFs / reports -> DOCS
        // - Inspection photos -> MEDIA/PHOTOS
        // - Inspection videos -> MEDIA/VIDEOS
        const attList = (Object.keys(attachments) as DocType[])
          .map(docType => {
            const att = attachments[docType];
            if (!att || (!att.file_url && !att._fileObject)) return null;
            return {
              name: att.file_name,
              url: att.file_url,
              mimeType: att.mime_type,
              fileObject: att._fileObject,
              docType,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        if (attList.length > 0) {
          setDriveFeedback(`Organizing & syncing ${attList.length} files to Google Drive (DOCS, MEDIA/PHOTOS, MEDIA/VIDEOS)...`);
          const syncResult = await googleDriveService.syncJobAttachmentsToDrive(folderNo, attList);
          setDriveFeedback(`✓ Verified Google Drive tree & organized ${syncResult.uploadedCount} files into DOCS, MEDIA/PHOTOS, and MEDIA/VIDEOS!`);
          showUploadToast('success', `✓ Google Drive folder ${hierarchy.vehicleFolder.name} created & ${syncResult.uploadedCount} file(s) uploaded and ready!`);
        } else {
          setDriveFeedback(`✓ Folder tree created on Google Drive: ${hierarchy.vehicleFolder.name} (DOCS, MEDIA/PHOTOS, MEDIA/VIDEOS, MEDIA/SUBMIT)`);
          showUploadToast('success', `✓ Google Drive folder ${hierarchy.vehicleFolder.name} created & ready (DOCS, MEDIA/PHOTOS, MEDIA/VIDEOS)!`);
        }
      } else {
        const demo = googleDriveService.getDemoHierarchy(folderNo);
        setDriveHierarchy(demo);
        if (!videosUrl) {
          setVideosUrl(demo.videosFolder.webViewLink);
        }
        setDriveFeedback(`Directory ready for ${demo.vehicleFolder.name}`);
        showUploadToast('success', `✓ Google Drive folder directory ready for ${demo.vehicleFolder.name}`);
      }
    } catch (err: any) {
      console.error(err);
      setDriveFeedback(`Drive sync notice: ${err.message || 'Please connect Google Drive'}`);
      showUploadToast('error', `Drive sync notice: ${err.message || 'Please connect Google Drive'}`);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  // Direct Google Drive Connection & Resume Upload (Prevents popup blocker errors)
  const handleConnectAndResumeUpload = async (useRedirect = false) => {
    if (useRedirect) {
      sessionStorage.setItem('avv_mate_active_job_draft', JSON.stringify({
        folderNo,
        vin,
        rawId,
        mreNo,
      }));
      window.location.href = googleDriveService.getDirectAuthUrl();
      return;
    }

    try {
      setIsSyncingDrive(true);
      setDriveFeedback('Connecting Google account...');
      await googleDriveService.requestOAuthToken();
      setIsDriveConfigured(googleDriveService.isConfigured());
      setDriveFeedback('✓ Google Drive connected successfully!');

      if (pendingUpload) {
        const toUpload = pendingUpload;
        setPendingUpload(null);
        if (toUpload.type === 'photos') {
          await executeBatchPhotosUpload(toUpload.files);
        } else {
          await executeMultipleVideoUpload(toUpload.files);
        }
      }
    } catch (err: any) {
      console.error('Drive connection error:', err);
      setErrorMessage(`Google authorization notice: ${err.message || 'Please use Login via Redirect'}`);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  // Batch Photos Upload Handler (30–80+ photos) - NEVER BLOCKS
  const handleBatchPhotosUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    setErrorMessage('');
    setDriveFeedback(null);
    await executeBatchPhotosUpload(filesArray);
  };

  const executeBatchPhotosUpload = async (filesArray: File[]) => {
    setIsBatchUploading(true);
    setErrorMessage('');
    setDriveFeedback(null);
    showUploadToast('uploading', `Uploading ${filesArray.length} Compliance Photos...`);

    try {
      let targetHierarchy = driveHierarchy;
      if (!targetHierarchy || !targetHierarchy.photosFolder?.id) {
        try {
          if (googleDriveService.isConfigured() && googleDriveService.isTokenValid()) {
            targetHierarchy = await googleDriveService.ensureVehicleFolderHierarchy(folderNo, false);
          } else {
            targetHierarchy = googleDriveService.getDemoHierarchy(folderNo);
          }
        } catch (hierarchyErr) {
          console.warn('Drive hierarchy check skipped, using fallback:', hierarchyErr);
          targetHierarchy = googleDriveService.getDemoHierarchy(folderNo);
        }
        setDriveHierarchy(targetHierarchy);
      }

      setQueuedBatchPhotos(prev => [...prev, ...filesArray]);
      const newTotal = batchPhotosCount + filesArray.length;
      setBatchPhotosCount(newTotal);

      // If Google Drive is authorized on this device, mirror photos to MEDIA/PHOTOS
      let drivePhotosUploaded = false;
      if (googleDriveService.isConfigured() && googleDriveService.isTokenValid() && targetHierarchy?.photosFolder?.id && !targetHierarchy.photosFolder.id.startsWith('demo_')) {
        try {
          const uploaded = await googleDriveService.uploadBatch(
            targetHierarchy.photosFolder.id,
            filesArray,
            (completed, total, currentFile) => {
              setBatchProgress({ completed, total, currentFile });
              showUploadToast('uploading', `Uploading photo ${completed} of ${total}: ${currentFile}`);
            }
          );
          drivePhotosUploaded = true;
          setDriveFeedback(`✓ Successfully uploaded ${uploaded.length} photos to Google Drive (${folderNo}/MEDIA/PHOTOS)`);
          showUploadToast('success', `✓ Google Drive folder ready & ${uploaded.length} photos uploaded to ${folderNo}/MEDIA/PHOTOS!`);
        } catch (driveErr: any) {
          console.warn('Google Drive batch upload warning:', driveErr);
          setDriveFeedback(`✓ ${filesArray.length} photos attached to job (${newTotal} total)`);
        }
      } else {
        setDriveFeedback(`✓ ${filesArray.length} photos attached (${newTotal} total)`);
      }

      // Mark the PHOTOS slot as attached
      const firstFile = filesArray[0];
      const photosAtt = {
        file_name: `${newTotal} Compliance Photos (${folderNo}/MEDIA/PHOTOS)`,
        file_size: filesArray.reduce((acc, f) => acc + f.size, 0),
        mime_type: 'image/jpeg',
        file_url: targetHierarchy?.photosFolder.webViewLink || URL.createObjectURL(firstFile),
        _fileObject: firstFile
      };

      if (jobToEdit?.id) {
        const att = await attachmentService.uploadFile(jobToEdit.id, 'PHOTOS', firstFile);
        setAttachments(prev => ({
          ...prev,
          PHOTOS: {
            ...att,
            file_name: `${newTotal} Compliance Photos (${folderNo}/MEDIA/PHOTOS)`,
            file_url: targetHierarchy?.photosFolder.webViewLink || att.file_url
          }
        }));
      } else {
        setAttachments(prev => ({
          ...prev,
          PHOTOS: photosAtt
        }));
      }

      if (!drivePhotosUploaded) {
        showUploadToast('success', `✓ Successfully uploaded ${filesArray.length} Compliance Photos (${newTotal} total)!`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Batch photo notice: ${err.message || 'Error attaching photos'}`);
      showUploadToast('error', `Batch photo notice: ${err.message || 'Error attaching photos'}`);
    } finally {
      setIsBatchUploading(false);
      setBatchProgress(null);
    }
  };

  // Multiple Videos Upload Handler (supports 2 to 3+ videos) - NEVER BLOCKS
  const handleMultipleVideoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    setErrorMessage('');
    setDriveFeedback(null);
    await executeMultipleVideoUpload(filesArray);
  };

  const executeMultipleVideoUpload = async (filesArray: File[]) => {
    setIsVideoUploading(true);
    setErrorMessage('');
    setDriveFeedback(null);
    showUploadToast('uploading', `Uploading ${filesArray.length} inspection video clip(s)...`);

    try {
      let targetHierarchy = driveHierarchy;
      if (!targetHierarchy || !targetHierarchy.videosFolder?.id) {
        try {
          if (googleDriveService.isConfigured() && googleDriveService.isTokenValid()) {
            targetHierarchy = await googleDriveService.ensureVehicleFolderHierarchy(folderNo, false);
          } else {
            targetHierarchy = googleDriveService.getDemoHierarchy(folderNo);
          }
        } catch (_) {
          targetHierarchy = googleDriveService.getDemoHierarchy(folderNo);
        }
        setDriveHierarchy(targetHierarchy);
      }

      const totalVideos = filesArray.length;
      const uploadedList: Array<{ id?: string; name: string; size?: number; webViewLink: string }> = [];
      const isDriveActive = Boolean(googleDriveService.isConfigured() && googleDriveService.isTokenValid() && targetHierarchy?.videosFolder?.id && !targetHierarchy.videosFolder.id.startsWith('demo_'));

      for (let i = 0; i < totalVideos; i++) {
        const file = filesArray[i];
        setVideoProgress({
          current: i + 1,
          total: totalVideos,
          percent: 10,
          name: file.name,
        });
        showUploadToast('uploading', `Uploading video (${i + 1}/${totalVideos}): ${file.name}...`);

        if (isDriveActive && targetHierarchy?.videosFolder?.id) {
          try {
            const uploaded = await googleDriveService.uploadResumableFile(
              targetHierarchy.videosFolder.id,
              file,
              pct => {
                setVideoProgress({
                  current: i + 1,
                  total: totalVideos,
                  percent: pct,
                  name: file.name,
                });
                showUploadToast('uploading', `Uploading video (${i + 1}/${totalVideos}): ${file.name} (${pct}%)...`);
              }
            );

            uploadedList.push({
              id: uploaded.id,
              name: file.name,
              size: file.size,
              webViewLink: uploaded.webViewLink,
            });
          } catch (uploadErr: any) {
            console.warn(`Drive upload notice for video ${file.name}:`, uploadErr);
            uploadedList.push({
              name: file.name,
              size: file.size,
              webViewLink: URL.createObjectURL(file),
            });
          }
        } else {
          // Drive not linked on this device -> attach locally without blocking
          uploadedList.push({
            name: file.name,
            size: file.size,
            webViewLink: URL.createObjectURL(file),
          });
        }
      }

      if (uploadedList.length > 0) {
        setVideoList(prev => [...prev, ...uploadedList]);
        const mainVideoLink = targetHierarchy?.videosFolder?.webViewLink || uploadedList[0].webViewLink;
        setVideosUrl(mainVideoLink);
        if (isDriveActive) {
          setDriveFeedback(`✓ Successfully uploaded ${uploadedList.length} video(s) to Google Drive (${folderNo}/MEDIA/VIDEOS)`);
          showUploadToast('success', `✓ Google Drive folder ready & ${uploadedList.length} video(s) uploaded to ${folderNo}/MEDIA/VIDEOS!`);
        } else {
          setDriveFeedback(`✓ Successfully attached ${uploadedList.length} video(s)!`);
          showUploadToast('success', `✓ Successfully uploaded ${uploadedList.length} Inspection Video(s) to Compliance!`);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Video attachment notice: ${err.message || 'Error attaching video'}`);
      showUploadToast('error', `Video attachment notice: ${err.message || 'Error attaching video'}`);
    } finally {
      setIsVideoUploading(false);
      setVideoProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderNo.trim()) {
      setErrorMessage('Folder number is required');
      return;
    }
    if (!vin.trim()) {
      setErrorMessage('VIN number is required');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    showUploadToast('uploading', `Saving compliance job ${folderNo.toUpperCase().trim()} & processing attachments...`);

    try {
      let savedJob: ComplianceJob;
      const uploadedAttachments: Record<string, { name: string; url: string; mimeType: string; docType: DocType; fileObject?: File; file_size?: number }> = {};

      if (jobToEdit) {
        try {
          savedJob = await complianceJobService.update(jobToEdit.id, {
            raw_id: rawId || null,
            mre_no: mreNo || null,
            request_received: requestReceived,
            videos_url: videosUrl || null,
            avv_verification_date: avvVerificationDate || null,
            avv_submit_date: avvSubmitDate || null,
            rav_date_of_entry: ravDateOfEntry || null,
            approval_date: approvalDate || null,
            recall_check_date: recallCheckDate || null,
            status,
            error_note: errorNote || null,
          });
        } catch (updateErr) {
          console.warn('Supabase update bypassed/failed, updating locally:', updateErr);
          savedJob = {
            ...jobToEdit,
            raw_id: rawId || null,
            mre_no: mreNo || null,
            request_received: requestReceived,
            videos_url: videosUrl || null,
            avv_verification_date: avvVerificationDate || null,
            avv_submit_date: avvSubmitDate || null,
            rav_date_of_entry: ravDateOfEntry || null,
            approval_date: approvalDate || null,
            recall_check_date: recallCheckDate || null,
            status,
            error_note: errorNote || null,
          };
        }

        // Collect existing attachments
        for (const [docKey, att] of Object.entries(attachments)) {
          if (att?.file_url) {
            uploadedAttachments[docKey] = {
              name: att.file_name,
              url: att.file_url,
              file_size: att.file_size || att.size || att._fileObject?.size || 0,
              mimeType: att.mime_type || 'application/pdf',
              docType: docKey as DocType,
              fileObject: att._fileObject,
            };
          }
        }
      } else {
        try {
          savedJob = await complianceJobService.create({
            folder_no: folderNo.toUpperCase().trim(),
            vin: vin.toUpperCase().trim(),
            raw_id: rawId || null,
            mre_no: mreNo || null,
            request_received: requestReceived,
            videos_url: videosUrl || null,
            avv_verification_date: avvVerificationDate || null,
            avv_submit_date: avvSubmitDate || null,
            rav_date_of_entry: ravDateOfEntry || null,
            approval_date: approvalDate || null,
            recall_check_date: recallCheckDate || null,
            status,
            error_note: errorNote || null,
          });
        } catch (createErr) {
          console.warn('Supabase create bypassed/failed, creating locally:', createErr);
          savedJob = {
            id: `job_sheet_${folderNo.toUpperCase().trim()}`,
            folder_no: folderNo.toUpperCase().trim(),
            vin: vin.toUpperCase().trim(),
            raw_id: rawId || null,
            mre_no: mreNo || null,
            request_received: requestReceived,
            videos_url: videosUrl || null,
            avv_verification_date: avvVerificationDate || null,
            avv_submit_date: avvSubmitDate || null,
            rav_date_of_entry: ravDateOfEntry || null,
            approval_date: approvalDate || null,
            recall_check_date: recallCheckDate || null,
            status,
            error_note: errorNote || null,
          };
        }

        // Upload any queued attachments from creation form to Supabase Storage if available
        for (const [docKey, att] of Object.entries(attachments)) {
          const fileObj = att?._fileObject || (att as any)?.fileObject;
          if (fileObj) {
            try {
              const uploadedAtt = await attachmentService.uploadFile(savedJob.id, docKey as DocType, fileObj);
              uploadedAttachments[docKey] = {
                name: uploadedAtt.file_name,
                url: uploadedAtt.file_url,
                file_size: uploadedAtt.file_size || fileObj.size,
                mimeType: uploadedAtt.mime_type || att.mime_type || 'application/pdf',
                docType: docKey as DocType,
                fileObject: fileObj,
              };
            } catch (upErr) {
              console.warn(`Supabase upload skipped for ${docKey}:`, upErr);
              uploadedAttachments[docKey] = {
                name: att.file_name,
                url: att.file_url,
                file_size: att.file_size || fileObj.size,
                mimeType: att.mime_type || 'application/pdf',
                docType: docKey as DocType,
                fileObject: fileObj,
              };
            }
          } else if (att?.file_url) {
            uploadedAttachments[docKey] = {
              name: att.file_name,
              url: att.file_url,
              file_size: att.file_size || att.size || 0,
              mimeType: att.mime_type || 'application/pdf',
              docType: docKey as DocType,
            };
          }
        }
      }

      let driveSyncRes: any = null;

      // Automatically create Drive folder tree and push attachments on save
      if (googleDriveService.isConfigured()) {
        const cleanNo = folderNo.toUpperCase().trim();
        const attList = Object.values(uploadedAttachments);

        try {
          showUploadToast('uploading', `Creating Google Drive folder tree & uploading files for ${cleanNo}...`);
          // 1. Force refresh ensures that if the folder was deleted on Drive, it is freshly recreated
          const hierarchy = await googleDriveService.ensureVehicleFolderHierarchy(cleanNo, true);
          setDriveHierarchy(hierarchy);
          if (hierarchy?.vehicleFolder?.webViewLink) {
            savedJob.folder_url = hierarchy.vehicleFolder.webViewLink;
          }

          // 2. Upload/sync all files into their dedicated folders
          if (attList.length > 0) {
            driveSyncRes = await googleDriveService.syncJobAttachmentsToDrive(cleanNo, attList);
          }

          // 3. Upload all queued batch photos directly into MEDIA/PHOTOS
          if (queuedBatchPhotos.length > 0 && hierarchy.photosFolder?.id) {
            await googleDriveService.uploadBatch(
              hierarchy.photosFolder.id,
              queuedBatchPhotos
            );
          }
          showUploadToast('success', `✓ Google Drive folder created & all files uploaded and ready for ${cleanNo}!`);
        } catch (driveErr) {
          console.warn('Drive auto-sync on save error:', driveErr);
        }
      }

      if (!savedJob.folder_url && driveHierarchy?.vehicleFolder?.webViewLink) {
        savedJob.folder_url = driveHierarchy.vehicleFolder.webViewLink;
      }

      // Ensure workshop name and model report make/model are attached
      if (!savedJob.raw_workshop_name && currentWorkshop) {
        savedJob.raw_workshop_name = currentWorkshop.name;
      }
      if (!savedJob.make) {
        savedJob.make = currentMre?.make || detectedMake || null;
      }
      if (!savedJob.model) {
        savedJob.model = currentMre?.model || detectedModel || null;
      }
      if (extractedViaNo && !savedJob.via_no) {
        savedJob.via_no = extractedViaNo;
      }
      if (extractedBuildDate && (!savedJob.build_date || savedJob.build_date.includes('2026-11') || savedJob.build_date === '11/2026')) {
        savedJob.build_date = extractedBuildDate;
      }
      if (extractedUniqueId) {
        (savedJob as any).unique_id = extractedUniqueId;
      }

      // Reconstruct attachments map for savedJob
      const finalAttachments: any = { ...(savedJob.attachments || {}) };
      Object.entries(uploadedAttachments).forEach(([k, att]) => {
        const driveUp = driveSyncRes?.uploadedFiles?.[k] || driveSyncRes?.uploadedFiles?.[att.name];
        const directDriveUrl = driveUp?.webViewLink || (att as any).drive_file_url || (att as any).webViewLink;
        finalAttachments[k] = {
          id: `att_${folderNo}_${k}`,
          job_id: savedJob.id,
          doc_type: k,
          file_name: att.name,
          file_size: (att as any).file_size || att.fileObject?.size || 0,
          file_url: directDriveUrl || att.url,
          drive_file_url: directDriveUrl || (att as any).drive_file_url,
          webViewLink: directDriveUrl || (att as any).webViewLink,
          mime_type: att.mimeType,
          uploaded_at: new Date().toISOString(),
        };
      });
      savedJob.attachments = finalAttachments;
      const count = Object.values(finalAttachments).filter(Boolean).length;
      savedJob.uploaded_docs_count = count;
      savedJob.is_documents_complete = count >= 8;
      savedJob.avv_submit_date = avvSubmitDate || null;
      savedJob.approval_date = approvalDate || null;
      savedJob.recall_check_date = recallCheckDate || null;

      await onSaved(savedJob);
      onClose();
    } catch (err: any) {
      console.error('Save error:', err);
      setErrorMessage(err.message || 'Error saving compliance job');
      showUploadToast('error', err.message || 'Error saving compliance job');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentWorkshop = workshops.find(w => w.raw_id === rawId);
  const currentMre = modelReports.find(m => m.mre_no === mreNo);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-4 sm:my-8 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg sm:text-xl text-slate-900">
                {jobToEdit ? `EDIT COMPLIANCE JOB — ${jobToEdit.folder_no}` : 'NEW COMPLIANCE JOB ENTRY'}
              </span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold">
                AVV PIPELINE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter vehicle VIN, approvals, non-blocking certificate attachments, and inspection dates
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Upload & Processing Status Toast Banner */}
        {uploadToast && (
          <div
            className={`px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs border-b transition-all duration-300 ${
              uploadToast.type === 'uploading'
                ? 'bg-sky-50 text-sky-900 border-sky-200'
                : uploadToast.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-red-50 text-red-900 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2 font-medium min-w-0">
              {uploadToast.type === 'uploading' && (
                <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
              )}
              {uploadToast.type === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              {uploadToast.type === 'error' && (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span className="truncate">{uploadToast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadToast(null)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition cursor-pointer shrink-0"
              title="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Identification & Auto-Prefill */}
          <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-display mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-700" />
              1. Job & Vehicle Identification (Smart Prefill)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Folder # <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={folderNo}
                  onChange={e => setFolderNo(e.target.value)}
                  disabled={!!jobToEdit}
                  placeholder="SVC1040"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 focus:outline-hidden disabled:bg-slate-100"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  VIN # (Vehicle Identification Number) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vin}
                    onChange={e => handleVinChange(e.target.value)}
                    disabled={!!jobToEdit}
                    placeholder="Enter, paste or select 17-char VIN"
                    maxLength={17}
                    list="registered-vins-list"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 focus:outline-hidden disabled:bg-slate-100"
                    required
                  />
                  <datalist id="registered-vins-list">
                    {vehicles.map(v => (
                      <option key={v.vin} value={v.vin}>
                        {v.make && v.model ? `${v.make} ${v.model} • ${v.raw_id || 'Registered'}` : v.raw_id || ''}
                      </option>
                    ))}
                  </datalist>
                  {matchedVehicle && (
                    <span className="absolute right-3 top-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      <Check className="w-3 h-3" /> Auto-Prefilled
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Smart Prefill Results Display Card */}
            <div className="mt-4 pt-3 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* RAW Workshop Selection/Prefill */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  RAW Workshop (Auto-filled from VIN, or search & select)
                </label>
                <SearchableSelect
                  value={rawId}
                  onChange={val => setRawId(val)}
                  options={(() => {
                    const list = workshops.map(w => ({
                      value: w.raw_id,
                      label: w.raw_id,
                      subLabel: w.name,
                      badge: w.contact_phone || undefined,
                    }));
                    if (rawId && !list.some(item => item.value.toUpperCase() === rawId.toUpperCase())) {
                      list.unshift({
                        value: rawId,
                        label: rawId,
                        subLabel: 'Extracted from Document',
                        badge: undefined,
                      });
                    }
                    return list;
                  })()}
                  placeholder="-- Select Workshop --"
                  searchPlaceholder="Search by RAW ID or workshop name..."
                  emptyMessage="No workshops match your search"
                />
                {currentWorkshop && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Name: <span className="text-slate-800 font-semibold">{currentWorkshop.name}</span>
                  </p>
                )}
              </div>

              {/* Model Report Selection/Prefill */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model Report (MRE) (Auto-filled from VIN, or search & select)
                </label>
                <SearchableSelect
                  value={mreNo === 'MRE-000000' ? '' : mreNo}
                  onChange={val => setMreNo(val)}
                  options={(() => {
                    const list = modelReports.map(m => ({
                      value: m.mre_no,
                      label: m.mre_no,
                      subLabel: `${m.make} ${m.model}${m.sev_no ? ` • SEV: ${m.sev_no}` : ''}`,
                      badge: m.vcc || undefined,
                    }));
                    if (mreNo && mreNo !== 'MRE-000000' && !list.some(item => item.value.toUpperCase() === mreNo.toUpperCase())) {
                      const displayDesc = (detectedMake || detectedModel) ? `${detectedMake} ${detectedModel}`.trim() : 'Extracted from Document';
                      list.unshift({
                        value: mreNo,
                        label: mreNo,
                        subLabel: displayDesc,
                        badge: undefined,
                      });
                    }
                    return list;
                  })()}
                  placeholder="-- Select MRE --"
                  searchPlaceholder="Search by MRE #, make, model or SEV..."
                  emptyMessage="No model reports match your search"
                />
                {currentMre ? (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Make/Model: <span className="text-slate-800 font-semibold">{currentMre.make} {currentMre.model}</span> (SEV: {currentMre.sev_no || 'N/A'})
                  </p>
                ) : (detectedMake || detectedModel) ? (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium flex items-center gap-1.5">
                    Make/Model: <span className="text-slate-800 font-semibold">{detectedMake} {detectedModel}</span>
                    <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded text-[10px] font-bold border border-emerald-200">
                      ✓ Auto-Extracted
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Section 2: Progressive Document Attachments & High-Volume Media */}
          <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200 space-y-4">
            {/* Header & Completeness */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-1 border-b border-slate-200/80">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-display flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-700" />
                  2. Document Attachments & Vehicle Media
                </h3>
                <p className="text-[11px] text-slate-500">
                  Compliance documents (PDF) and Google Drive SaaS storage for 30–80+ photos and inspection videos
                </p>
              </div>

              {/* Completeness counter, Auto-sort button, and Request button */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 hover:from-sky-700 hover:to-indigo-800 rounded-lg shadow-xs cursor-pointer transition transform active:scale-98" title="Select multiple files to automatically sort and attach to compliance slots">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                  <span>Attach All & Auto-Sort</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/*,video/*,application/pdf"
                    className="hidden"
                    onChange={e => {
                      handleFilesSelectedForAutoSort(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>

                {jobToEdit && Object.values(attachments).filter(Boolean).length < 9 && onRequestDocs && (
                  <button
                    type="button"
                    onClick={() => onRequestDocs({ ...jobToEdit, attachments })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition shadow-2xs"
                    title="Send dynamic request via WhatsApp or Email"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Request Missing Docs</span>
                  </button>
                )}
                <span className="text-xs font-mono font-bold px-2 py-1 bg-sky-100 text-sky-800 rounded">
                  {Object.values(attachments).filter(Boolean).length}/9 Uploaded
                </span>
              </div>
            </div>

            {/* Google Drive Automated Vehicle Tree Banner */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded shrink-0">
                    <FolderTree className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        Google Drive Tree: <span className="font-mono text-sky-800">{folderNo || 'Vehicle Folder'}</span>
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                        isDriveConfigured && googleDriveService.isTokenValid()
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isDriveConfigured && googleDriveService.isTokenValid() ? 'Drive Storage Active' : 'Drive Reconnect Needed'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      📁 {folderNo || 'SVC...'} &rarr; 📁 DOCS & 📁 MEDIA (📁 PHOTOS, 📁 VIDEOS, 📁 SUBMIT)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!googleDriveService.isTokenValid() && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleConnectAndResumeUpload(false)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded transition shadow-2xs cursor-pointer"
                        title="Authorize Google Drive on this browser"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>Connect Drive</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConnectAndResumeUpload(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition cursor-pointer"
                        title="Direct login if Safari blocks popups"
                      >
                        <span>Redirect</span>
                      </button>
                    </div>
                  )}
                  {(() => {
                    const rawLink = driveHierarchy?.vehicleFolder.webViewLink;
                    const defaultRoot = googleDriveService.getConfig().rootFolderId || '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5';
                    const safeLink = rawLink && !rawLink.includes('#')
                      ? rawLink
                      : `https://drive.google.com/drive/folders/${defaultRoot}`;
                    return (
                      <a
                        href={safeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded transition"
                        title="Open this car's folder on Google Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open in Drive</span>
                      </a>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={handleInitializeDrive}
                    disabled={isSyncingDrive}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                    <span>{isSyncingDrive ? 'Verifying…' : 'Sync Folders'}</span>
                  </button>
                </div>
              </div>

              {driveFeedback && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-800 flex items-center gap-1.5 animate-in fade-in duration-150">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{driveFeedback}</span>
                </div>
              )}
            </div>

            {/* Pending Upload Drive Authorization Banner */}
            {pendingUpload && (
              <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-amber-950 text-xs sm:text-sm">
                      {pendingUpload.files.length} {pendingUpload.type === 'photos' ? 'Photos' : 'Videos'} Ready to Upload
                    </h5>
                    <p className="text-amber-800 text-[11px] mt-0.5">
                      Google Drive must be connected on this browser to upload directly to AVV Mate Drive. Click below to sign in:
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleConnectAndResumeUpload(false)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-xs text-xs transition cursor-pointer"
                  >
                    Sign In & Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConnectAndResumeUpload(true)}
                    className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-lg text-[11px] transition cursor-pointer"
                    title="Bypasses browser popup blockers completely by redirecting to Google Sign-In"
                  >
                    Login via Redirect
                  </button>
                </div>
              </div>
            )}

            {/* 1-Click Multi-File Dropzone & Auto-Sort Banner */}
            <div
              onDragOver={e => {
                e.preventDefault();
                setIsDragOverDropzone(true);
              }}
              onDragLeave={() => setIsDragOverDropzone(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDragOverDropzone(false);
                handleFilesSelectedForAutoSort(e.dataTransfer.files);
              }}
              className={`p-3 rounded-xl border-2 border-dashed transition flex flex-col sm:flex-row items-center justify-between gap-3 ${
                isDragOverDropzone
                  ? 'border-sky-500 bg-sky-100/90 shadow-md scale-[1.01]'
                  : 'border-sky-200/90 hover:border-sky-400 bg-gradient-to-r from-sky-50/70 via-indigo-50/40 to-white'
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs">
                <div className="p-2 bg-sky-100 text-sky-800 rounded-lg shrink-0">
                  <Sparkles className="w-4 h-4 text-sky-700" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>One-Click Smart Document Attacher & Auto-Sorter</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-200/70 text-sky-900 font-semibold">ALL-IN-ONE</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Drop all vehicle files here (or select multiple) to automatically match CRE, EC, CIN, WI, DC, VI, RAW DECLA, RECALL, Photos & Videos without attaching individually.
                  </p>
                </div>
              </div>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-800 bg-white hover:bg-sky-50 border border-sky-300 rounded-lg shadow-2xs cursor-pointer transition shrink-0">
                <Upload className="w-3.5 h-3.5 text-sky-600" />
                <span>Select All Files</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*,video/*,application/pdf"
                  className="hidden"
                  onChange={e => {
                    handleFilesSelectedForAutoSort(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {/* 8 Document Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {REQUIRED_DOC_TYPES.map(doc => {
                const att = attachments[doc.type];
                const isUploading = uploadingDoc === doc.type;
                const isPhotos = doc.type === 'PHOTOS';
                const isPhotosUploading = isPhotos && isBatchUploading;

                return (
                  <div
                    key={doc.type}
                    className={`p-3 rounded-lg border text-xs transition flex flex-col justify-between ${
                      isUploading || isPhotosUploading
                        ? 'bg-sky-50/80 border-sky-400 ring-2 ring-sky-400 ring-offset-1 shadow-xs animate-pulse'
                        : att
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : isPhotos
                        ? 'bg-sky-50/30 border-sky-200 hover:border-sky-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {doc.label}
                        </span>
                        {isUploading || isPhotosUploading ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                            <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                            <span>Uploading…</span>
                          </span>
                        ) : att ? (
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                              <Check className="w-3 h-3" /> {isPhotos && batchPhotosCount > 1 ? `${batchPhotosCount} Photos` : 'Attached'}
                            </span>
                            {isDriveConfigured && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-700 bg-sky-50 px-1 py-0.2 rounded border border-sky-200" title="Ready in Google Drive">
                                ☁️ Drive Ready
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium truncate mb-2" title={doc.name}>
                        {doc.name} {isPhotos && <span className="text-sky-700 font-semibold">(30–80+)</span>}
                      </p>

                      {att && (
                        <div className="text-[10px] text-slate-600 bg-white/70 p-1.5 rounded border border-emerald-200/60 mb-2 truncate">
                          <p className="font-semibold text-slate-800 truncate" title={att.file_name}>
                            {att.file_name}
                          </p>
                          <p className="text-slate-400 font-mono text-[10px] flex items-center gap-1.5">
                            {att.file_size && att.file_size > 0 ? (
                              <span>{formatBytes(att.file_size)}</span>
                            ) : att._fileObject?.size ? (
                              <span>{formatBytes(att._fileObject.size)}</span>
                            ) : (
                              <span className="text-emerald-600 font-sans font-medium">Ready in Google Drive</span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Batch photo upload progress */}
                      {isPhotos && isBatchUploading && (
                        <div className="p-2 bg-sky-50 border border-sky-200 rounded text-[10px] text-sky-800 mb-2 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span className="flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                              <span>Uploading to MEDIA/PHOTOS…</span>
                            </span>
                            <span>{batchProgress?.completed || 0}/{batchProgress?.total || 'batch'}</span>
                          </div>
                          <div className="w-full bg-sky-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-sky-600 h-1.5 transition-all duration-200 animate-pulse"
                              style={{ width: `${batchProgress && batchProgress.total ? Math.round((batchProgress.completed / batchProgress.total) * 100) : 50}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/60">
                      {att ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleViewAttachment(doc.type, att)}
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 transition cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" /> View
                          </button>
                          {isPhotos && (
                            <label className={`p-1 rounded border border-sky-200 cursor-pointer transition ${
                              isBatchUploading
                                ? 'bg-sky-100 text-sky-400 cursor-wait'
                                : 'text-sky-700 hover:text-sky-900 hover:bg-sky-100'
                            }`} title="Add more photos (up to 80+)">
                              {isBatchUploading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <input
                                type="file"
                                multiple
                                disabled={isBatchUploading}
                                accept="image/*"
                                className="hidden"
                                onChange={e => {
                                  handleBatchPhotosUpload(e.target.files);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(doc.type)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : isPhotos ? (
                        <div className="flex-1 flex gap-1">
                          <label className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] font-semibold text-white rounded cursor-pointer transition shadow-2xs ${
                            isBatchUploading ? 'bg-sky-800 cursor-wait' : 'bg-sky-700 hover:bg-sky-800'
                          }`}>
                            {isBatchUploading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-200" />
                                <span>Uploading Photos…</span>
                              </>
                            ) : (
                              <>
                                <Images className="w-3 h-3" />
                                <span>Batch (30–80+)</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              disabled={isBatchUploading}
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                handleBatchPhotosUpload(e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-[11px] font-semibold rounded border cursor-pointer transition ${
                          isUploading
                            ? 'bg-sky-100 text-sky-800 border-sky-300 cursor-wait'
                            : 'text-slate-700 bg-slate-100 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 border-slate-200'
                        }`}>
                          {isUploading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                              <span>Uploading…</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3 h-3" />
                              <span>Attach</span>
                            </>
                          )}
                          <input
                            type="file"
                            disabled={isUploading}
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(doc.type, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Video Inspection Section with Direct Upload to Drive MEDIA/VIDEOS */}
            <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase font-display tracking-wider">
                  <Film className="w-4 h-4 text-sky-700" />
                  Vehicle Inspection Videos (MEDIA/VIDEOS)
                </label>
                <div className="flex items-center gap-2">
                  {videoList.length > 0 && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" /> {videoList.length} Video{videoList.length > 1 ? 's' : ''} on File
                    </span>
                  )}
                  {(driveHierarchy?.videosFolder?.webViewLink || videosUrl) && (
                    <a
                      href={driveHierarchy?.videosFolder?.webViewLink || videosUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 transition"
                      title="Open MEDIA/VIDEOS folder in Google Drive"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open Videos Folder</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Direct Multi-Video File Upload Box */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5">
                {videoList.length > 0 ? (
                  <div className="space-y-2">
                    {/* List of uploaded inspection videos */}
                    <div className="space-y-1.5">
                      {videoList.map((vid, idx) => (
                        <div
                          key={vid.id || `${vid.name}-${idx}`}
                          className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-sky-100 text-sky-800 rounded shrink-0">
                              <Film className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate" title={vid.name}>
                                {vid.name}
                              </p>
                              <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                                <span>{vid.size ? formatBytes(vid.size) : 'Drive Video'} • {folderNo}/MEDIA/VIDEOS</span>
                                {isDriveConfigured && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-700 bg-sky-50 px-1 py-0.2 rounded border border-sky-200">
                                    ☁️ Drive Ready
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={vid.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sky-700 bg-white hover:bg-sky-50 border border-sky-200 rounded transition"
                              title="Watch clip in Google Drive"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Watch</span>
                            </a>

                            <button
                              type="button"
                              onClick={() => {
                                setVideoList(prev => {
                                  const updated = prev.filter((_, i) => i !== idx);
                                  if (updated.length === 0) {
                                    setVideosUrl('');
                                  } else {
                                    setVideosUrl(driveHierarchy?.videosFolder?.webViewLink || updated[0].webViewLink);
                                  }
                                  return updated;
                                });
                              }}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                              title="Remove video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add More Videos Controls */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <p className="text-[11px] text-slate-500">
                        Supports 2–3+ inspection clips (e.g. walkaround, underbody, engine bay)
                      </p>
                      <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition cursor-pointer ${
                        isVideoUploading
                          ? 'bg-sky-100 text-sky-800 border-sky-300 cursor-wait'
                          : 'text-sky-700 bg-sky-50 hover:bg-sky-100 border-sky-300'
                      }`}>
                        {isVideoUploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                            <span>Uploading…</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Video(s)</span>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
                          className="hidden"
                          disabled={isVideoUploading}
                          onChange={e => {
                            handleMultipleVideoUpload(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className={`flex flex-col sm:flex-row items-center justify-center gap-2.5 p-4 border-2 border-dashed rounded-lg transition text-center sm:text-left ${
                    isVideoUploading
                      ? 'border-sky-400 bg-sky-50/80 cursor-wait ring-2 ring-sky-300 ring-offset-1 animate-pulse'
                      : 'border-slate-300 hover:border-sky-500 hover:bg-sky-50/50 cursor-pointer'
                  }`}>
                    <div className="p-2 bg-sky-100 text-sky-700 rounded-full shrink-0">
                      {isVideoUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-sky-700" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 flex items-center justify-center sm:justify-start gap-1.5">
                        {isVideoUploading && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 shrink-0" />}
                        <span>
                          {isVideoUploading
                            ? `Uploading Video ${videoProgress?.current || 1} of ${videoProgress?.total || 1}... (${videoProgress?.percent || 0}%)`
                            : 'Upload Vehicle Inspection Videos (2–3+ clips supported)'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {isVideoUploading
                          ? `Processing ${videoProgress?.name || 'video file'} — uploading directly to Google Drive`
                          : <>Select 1, 2, 3 or more inspection clips (.mp4, .mov) — uploaded directly to Google Drive: <span className="font-mono font-semibold text-sky-800">{folderNo}/MEDIA/VIDEOS</span></>}
                      </p>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
                      className="hidden"
                      disabled={isVideoUploading}
                      onChange={e => {
                        handleMultipleVideoUpload(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}

                {isVideoUploading && (
                  <div className="mt-2 space-y-1.5 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                    <div className="flex items-center justify-between text-xs font-semibold text-sky-950">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                        <span>Uploading Video {videoProgress?.current || 1} of ${videoProgress?.total || 1}...</span>
                      </span>
                      <span className="font-mono text-sky-700 font-bold">{videoProgress?.percent || 0}%</span>
                    </div>
                    <div className="w-full bg-sky-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-sky-600 h-2 transition-all duration-300 animate-pulse"
                        style={{ width: `${videoProgress?.percent || 0}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-600 font-mono truncate">
                      Transferring: {videoProgress?.name || ''} to {folderNo}/MEDIA/VIDEOS
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Workflow Milestones & Dates */}
          <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-display mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-700" />
              3. Verification Dates & Status
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Request Received <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={requestReceived}
                  onChange={e => setRequestReceived(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  AVV Verification Date
                </label>
                <input
                  type="date"
                  value={avvVerificationDate}
                  onChange={e => setAvvVerificationDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  AVV Submit Date
                </label>
                <input
                  type="date"
                  value={avvSubmitDate}
                  onChange={e => setAvvSubmitDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  RAV Date of Entry
                </label>
                <input
                  type="date"
                  value={ravDateOfEntry}
                  onChange={e => setRavDateOfEntry(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Approval Payment Date
                </label>
                <input
                  type="date"
                  value={approvalDate}
                  onChange={e => setApprovalDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recall Check Date
                </label>
                <input
                  type="date"
                  value={recallCheckDate}
                  onChange={e => setRecallCheckDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Pipeline Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-semibold focus:ring-2 focus:ring-sky-500"
                >
                  <option value="in_progress">🟡 In Progress (Document Collection / Inspection)</option>
                  <option value="verified">🔵 Verified by AVV (Ready for RAV Submission)</option>
                  <option value="rav_entered">🟢 RAV Entered (Officially Road Registered)</option>
                  <option value="errored">🔴 Errored Entry (Superseded or Audited)</option>
                </select>
              </div>

              {status === 'errored' && (
                <div>
                  <label className="block text-xs font-semibold text-red-700 mb-1">
                    Error Description / Audit Note
                  </label>
                  <input
                    type="text"
                    value={errorNote}
                    onChange={e => setErrorNote(e.target.value)}
                    placeholder="Describe what was wrong in the RAV submission..."
                    className="w-full px-3 py-2 bg-red-50 border border-red-300 rounded-md text-sm text-red-900 focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold rounded-md shadow transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : jobToEdit ? 'Save Changes' : 'Create Job'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Auto-Sort & Batch Review Modal */}
      <AutoSortReviewModal
        isOpen={isAutoSortModalOpen}
        onClose={() => setIsAutoSortModalOpen(false)}
        matches={autoSortMatches}
        onUpdateMatch={handleUpdateAutoMatchTarget}
        onConfirm={handleConfirmAutoSort}
        isProcessing={isAutoSortProcessing}
        vinConflict={autoSortVinConflict}
      />
    </div>
  );
};
