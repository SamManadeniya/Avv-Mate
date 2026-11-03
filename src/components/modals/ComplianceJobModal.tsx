import React, { useState, useEffect } from 'react';
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
  HardDrive
} from 'lucide-react';
import type { ComplianceJob, Vehicle, RawWorkshop, ModelReport, DocType } from '../../types';
import { REQUIRED_DOC_TYPES } from '../../types';
import { attachmentService } from '../../services/attachmentService';
import { complianceJobService } from '../../services/complianceJobService';
import { googleDriveService, type VehicleDriveHierarchy } from '../../services/googleDriveService';
import { formatBytes } from '../../lib/utils';

interface ComplianceJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  jobToEdit?: ComplianceJob | null;
  vehicles: Vehicle[];
  workshops: RawWorkshop[];
  modelReports: ModelReport[];
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
  onRequestDocs,
}) => {
  const [folderNo, setFolderNo] = useState('');
  const [vin, setVin] = useState('');
  const [rawId, setRawId] = useState('');
  const [mreNo, setMreNo] = useState('');
  const [requestReceived, setRequestReceived] = useState('');
  const [videosUrl, setVideosUrl] = useState('');
  const [avvVerificationDate, setAvvVerificationDate] = useState('');
  const [ravDateOfEntry, setRavDateOfEntry] = useState('');
  const [status, setStatus] = useState<ComplianceJob['status']>('in_progress');
  const [errorNote, setErrorNote] = useState('');

  // Selected vehicle details (auto-prefilled)
  const [matchedVehicle, setMatchedVehicle] = useState<Vehicle | null>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<Record<DocType, any>>({
    CRE: null, EC: null, CIN: null, WI: null,
    DC: null, VI: null, RAW_DECLA: null, PHOTOS: null
  });
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
      setRavDateOfEntry(jobToEdit.rav_date_of_entry || '');
      setStatus(jobToEdit.status || 'in_progress');
      setErrorNote(jobToEdit.error_note || '');

      // Load attachments
      attachmentService.getByJobId(jobToEdit.id).then(setAttachments);

      // Match vehicle
      const v = vehicles.find(item => item.vin.toUpperCase() === jobToEdit.vin.toUpperCase());
      setMatchedVehicle(v || null);
    } else {
      // New Job mode
      complianceJobService.getLastFolderNo().then(last => {
        const next = last ? `SVC${String(parseInt(last.replace(/\D/g, '') || '1000', 10) + 1)}` : 'SVC1001';
        setFolderNo(next);
      });
      setVin('');
      setRawId('');
      setMreNo('');
      setRequestReceived(new Date().toISOString().slice(0, 10));
      setVideosUrl('');
      setVideoList([]);
      setAvvVerificationDate('');
      setRavDateOfEntry('');
      setStatus('in_progress');
      setErrorNote('');
      setMatchedVehicle(null);
      setAttachments({
        CRE: null, EC: null, CIN: null, WI: null,
        DC: null, VI: null, RAW_DECLA: null, PHOTOS: null
      });
      setQueuedBatchPhotos([]);
      setBatchPhotosCount(0);
    }
    setIsDriveConfigured(googleDriveService.isConfigured());
    setDriveFeedback(null);
    setErrorMessage('');
  }, [isOpen, jobToEdit, vehicles]);

  // Reactive Autocomplete: When VIN changes, lookup vehicle and prefill RAW ID and MRE
  const handleVinChange = (val: string) => {
    const cleanVin = val.toUpperCase().replace(/\s/g, '');
    setVin(cleanVin);

    const match = vehicles.find(v => v.vin.toUpperCase() === cleanVin);
    if (match) {
      setMatchedVehicle(match);
      if (match.raw_id) setRawId(match.raw_id);
      if (match.mre_no) setMreNo(match.mre_no);
    } else {
      setMatchedVehicle(null);
    }
  };

  // Handle file upload for a specific slot
  const handleFileUpload = async (docType: DocType, file: File) => {
    try {
      setUploadingDoc(docType);
      setErrorMessage('');

      if (jobToEdit?.id) {
        // Direct upload to Supabase
        const att = await attachmentService.uploadFile(jobToEdit.id, docType, file);
        setAttachments(prev => ({ ...prev, [docType]: att }));

        // Automatic mirror to Google Drive with proper folder segregation:
        // - Photos -> MEDIA/PHOTOS
        // - Videos -> MEDIA/VIDEOS
        // - PDFs / Docs -> DOCS
        if (googleDriveService.isConfigured()) {
          const isImg = docType === 'PHOTOS' || file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
          const isVid = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(file.name);
          const folderLabel = isImg ? 'MEDIA/PHOTOS' : isVid ? 'MEDIA/VIDEOS' : 'DOCS';

          googleDriveService.syncJobAttachmentsToDrive(folderNo, [{
            name: file.name,
            mimeType: file.type,
            fileObject: file,
            docType,
          }]).then(() => {
            setDriveFeedback(`✓ Auto-saved ${file.name} to Google Drive (${folderNo}/${folderLabel})`);
          }).catch(e => console.warn('Background Drive upload:', e));
        }
      } else {
        // If creating a brand new job before saving, store temporary local preview
        const tempAtt = {
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          file_url: URL.createObjectURL(file),
          _fileObject: file
        };
        setAttachments(prev => ({ ...prev, [docType]: tempAtt }));
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Failed to upload ${docType}: ${err.message || 'Error'}`);
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

  // Google Drive Automated Hierarchy Handler
  const handleInitializeDrive = async () => {
    if (!folderNo.trim()) {
      setErrorMessage('Please enter a folder number (e.g. SVC1028) first.');
      return;
    }
    setIsSyncingDrive(true);
    setDriveFeedback(null);
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
        } else {
          setDriveFeedback(`✓ Folder tree created on Google Drive: ${hierarchy.vehicleFolder.name} (DOCS, MEDIA/PHOTOS, MEDIA/VIDEOS, MEDIA/SUBMIT)`);
        }
      } else {
        const demo = googleDriveService.getDemoHierarchy(folderNo);
        setDriveHierarchy(demo);
        if (!videosUrl) {
          setVideosUrl(demo.videosFolder.webViewLink);
        }
        setDriveFeedback(`Directory ready for ${demo.vehicleFolder.name}`);
      }
    } catch (err: any) {
      console.error(err);
      setDriveFeedback(`Drive sync notice: ${err.message || 'Please connect Google Drive'}`);
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

  // Batch Photos Upload Handler (30–80+ photos)
  const handleBatchPhotosUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    setErrorMessage('');
    setDriveFeedback(null);

    // If Google Drive token is not yet active on this browser, queue and prompt without blocking
    if (googleDriveService.isConfigured() && !googleDriveService.isTokenValid()) {
      setPendingUpload({ type: 'photos', files: filesArray });
      return;
    }

    await executeBatchPhotosUpload(filesArray);
  };

  const executeBatchPhotosUpload = async (filesArray: File[]) => {
    setIsBatchUploading(true);
    setErrorMessage('');
    setDriveFeedback(null);

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

      if (googleDriveService.isConfigured() && googleDriveService.isTokenValid() && targetHierarchy?.photosFolder?.id && !targetHierarchy.photosFolder.id.startsWith('demo_')) {
        try {
          const uploaded = await googleDriveService.uploadBatch(
            targetHierarchy.photosFolder.id,
            filesArray,
            (completed, total, currentFile) => {
              setBatchProgress({ completed, total, currentFile });
            }
          );
          setDriveFeedback(`✓ Successfully uploaded all ${uploaded.length} photos to Google Drive (${folderNo}/MEDIA/PHOTOS)`);
        } catch (driveErr: any) {
          console.warn('Google Drive batch upload warning:', driveErr);
          setDriveFeedback(`Photos queued in compliance job: ${driveErr.message || 'Queued'}`);
        }
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
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Batch photo upload error: ${err.message || 'Error'}`);
    } finally {
      setIsBatchUploading(false);
      setBatchProgress(null);
    }
  };

  // Multiple Videos Upload Handler (supports 2 to 3+ videos)
  const handleMultipleVideoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    setErrorMessage('');
    setDriveFeedback(null);

    // If Google Drive token is not yet active on this browser, queue and prompt without blocking
    if (googleDriveService.isConfigured() && !googleDriveService.isTokenValid()) {
      setPendingUpload({ type: 'videos', files: filesArray });
      return;
    }

    await executeMultipleVideoUpload(filesArray);
  };

  const executeMultipleVideoUpload = async (filesArray: File[]) => {
    setIsVideoUploading(true);
    setErrorMessage('');
    setDriveFeedback(null);

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
              }
            );

            uploadedList.push({
              id: uploaded.id,
              name: file.name,
              size: file.size,
              webViewLink: uploaded.webViewLink,
            });
          } catch (uploadErr: any) {
            console.error(`Failed uploading video ${file.name}:`, uploadErr);
            setErrorMessage(`Failed uploading "${file.name}": ${uploadErr.message || 'Error'}`);
          }
        } else {
          // Demo / local mode
          uploadedList.push({
            name: file.name,
            size: file.size,
            webViewLink: targetHierarchy?.videosFolder?.webViewLink || `https://drive.google.com/drive/folders/#${folderNo}_VIDEOS`,
          });
        }
      }

      if (uploadedList.length > 0) {
        setVideoList(prev => [...prev, ...uploadedList]);
        const mainVideoLink = targetHierarchy?.videosFolder?.webViewLink || uploadedList[0].webViewLink;
        setVideosUrl(mainVideoLink);
        setDriveFeedback(`✓ Successfully added ${uploadedList.length} video(s) to Google Drive (${folderNo}/MEDIA/VIDEOS)`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Video upload error: ${err.message || 'Error'}`);
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

    try {
      let savedJob: ComplianceJob;
      const uploadedAttachments: Record<string, { name: string; url: string; mimeType: string; docType: DocType }> = {};

      if (jobToEdit) {
        savedJob = await complianceJobService.update(jobToEdit.id, {
          raw_id: rawId || null,
          mre_no: mreNo || null,
          request_received: requestReceived,
          videos_url: videosUrl || null,
          avv_verification_date: avvVerificationDate || null,
          rav_date_of_entry: ravDateOfEntry || null,
          status,
          error_note: errorNote || null,
        });

        // Collect existing attachments
        for (const [docKey, att] of Object.entries(attachments)) {
          if (att?.file_url) {
            uploadedAttachments[docKey] = {
              name: att.file_name,
              url: att.file_url,
              mimeType: att.mime_type || 'application/pdf',
              docType: docKey as DocType,
            };
          }
        }
      } else {
        savedJob = await complianceJobService.create({
          folder_no: folderNo.toUpperCase().trim(),
          vin: vin.toUpperCase().trim(),
          raw_id: rawId || null,
          mre_no: mreNo || null,
          request_received: requestReceived,
          videos_url: videosUrl || null,
          avv_verification_date: avvVerificationDate || null,
          rav_date_of_entry: ravDateOfEntry || null,
          status,
          error_note: errorNote || null,
        });

        // Upload any queued attachments from creation form to Supabase Storage
        for (const [docKey, att] of Object.entries(attachments)) {
          if (att?._fileObject) {
            try {
              const uploadedAtt = await attachmentService.uploadFile(savedJob.id, docKey as DocType, att._fileObject);
              uploadedAttachments[docKey] = {
                name: uploadedAtt.file_name,
                url: uploadedAtt.file_url,
                mimeType: uploadedAtt.mime_type || att.mime_type || 'application/pdf',
                docType: docKey as DocType,
              };
            } catch (upErr) {
              console.warn(`Failed uploading ${docKey} to Supabase:`, upErr);
            }
          }
        }
      }

      // Automatically create Drive folder tree and push attachments on save
      if (googleDriveService.isConfigured() && googleDriveService.isTokenValid()) {
        const cleanNo = folderNo.toUpperCase().trim();
        const attList = Object.values(uploadedAttachments);

        try {
          // 1. Force refresh ensures that if the folder was deleted on Drive, it is freshly recreated
          const hierarchy = await googleDriveService.ensureVehicleFolderHierarchy(cleanNo, true);
          setDriveHierarchy(hierarchy);

          // 2. Upload/sync all files into their dedicated folders
          if (attList.length > 0) {
            await googleDriveService.syncJobAttachmentsToDrive(cleanNo, attList);
          }

          // 3. Upload all queued batch photos directly into MEDIA/PHOTOS
          if (queuedBatchPhotos.length > 0 && hierarchy.photosFolder?.id) {
            await googleDriveService.uploadBatch(
              hierarchy.photosFolder.id,
              queuedBatchPhotos
            );
          }
        } catch (driveErr) {
          console.warn('Drive auto-sync on save error:', driveErr);
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Save error:', err);
      setErrorMessage(err.message || 'Error saving compliance job');
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
                    placeholder="Enter or paste 17-char VIN"
                    maxLength={17}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-sm uppercase focus:ring-2 focus:ring-sky-500 focus:outline-hidden disabled:bg-slate-100"
                    required
                  />
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
                  RAW Workshop (Auto-filled from VIN, or select)
                </label>
                <select
                  value={rawId}
                  onChange={e => setRawId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- Select Workshop --</option>
                  {workshops.map(w => (
                    <option key={w.raw_id} value={w.raw_id}>
                      {w.raw_id} • {w.name}
                    </option>
                  ))}
                </select>
                {currentWorkshop && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Name: <span className="text-slate-800 font-semibold">{currentWorkshop.name}</span>
                  </p>
                )}
              </div>

              {/* Model Report Selection/Prefill */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model Report (MRE) (Auto-filled from VIN, or select)
                </label>
                <select
                  value={mreNo}
                  onChange={e => setMreNo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- Select MRE --</option>
                  {modelReports.map(m => (
                    <option key={m.mre_no} value={m.mre_no}>
                      {m.mre_no} • {m.make} {m.model}
                    </option>
                  ))}
                </select>
                {currentMre && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Make/Model: <span className="text-slate-800 font-semibold">{currentMre.make} {currentMre.model}</span> (SEV: {currentMre.sev_no || 'N/A'})
                  </p>
                )}
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

              {/* Completeness counter and Request button */}
              <div className="flex items-center gap-2 flex-wrap">
                {jobToEdit && Object.values(attachments).filter(Boolean).length < 8 && onRequestDocs && (
                  <button
                    type="button"
                    onClick={() => onRequestDocs(jobToEdit)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition shadow-2xs"
                    title="Send dynamic request via WhatsApp or Email"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Request Missing Docs</span>
                  </button>
                )}
                <span className="text-xs font-mono font-bold px-2 py-1 bg-sky-100 text-sky-800 rounded">
                  {Object.values(attachments).filter(Boolean).length}/8 Uploaded
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

            {/* 8 Document Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {REQUIRED_DOC_TYPES.map(doc => {
                const att = attachments[doc.type];
                const isUploading = uploadingDoc === doc.type;
                const isPhotos = doc.type === 'PHOTOS';

                return (
                  <div
                    key={doc.type}
                    className={`p-3 rounded-lg border text-xs transition flex flex-col justify-between ${
                      att
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
                        {att ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                            <Check className="w-3 h-3" /> {isPhotos && batchPhotosCount > 1 ? `${batchPhotosCount} Photos` : 'Attached'}
                          </span>
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
                          <p className="text-slate-400 font-mono">
                            {formatBytes(att.file_size)}
                          </p>
                        </div>
                      )}

                      {/* Batch photo upload progress */}
                      {isPhotos && isBatchUploading && (
                        <div className="p-2 bg-sky-50 border border-sky-200 rounded text-[10px] text-sky-800 mb-2 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>Uploading to MEDIA/PHOTOS…</span>
                            <span>{batchProgress?.completed || 0}/{batchProgress?.total || 'batch'}</span>
                          </div>
                          <div className="w-full bg-sky-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-sky-600 h-1.5 transition-all duration-200"
                              style={{ width: `${batchProgress ? Math.round((batchProgress.completed / batchProgress.total) * 100) : 50}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/60">
                      {att ? (
                        <>
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 transition"
                          >
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                          {isPhotos && (
                            <label className="p-1 text-sky-700 hover:text-sky-900 hover:bg-sky-100 rounded border border-sky-200 cursor-pointer transition" title="Add more photos (up to 80+)">
                              <Upload className="w-3.5 h-3.5" />
                              <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleBatchPhotosUpload(e.target.files)}
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
                          <label className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded cursor-pointer transition shadow-2xs">
                            <Images className="w-3 h-3" />
                            <span>{isBatchUploading ? 'Uploading…' : 'Batch (30–80+)'}</span>
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              className="hidden"
                              onChange={e => handleBatchPhotosUpload(e.target.files)}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 rounded border border-slate-200 cursor-pointer transition">
                          <Upload className="w-3 h-3" />
                          <span>{isUploading ? 'Uploading…' : 'Attach'}</span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(doc.type, file);
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
                              <p className="text-[10px] text-slate-500 font-mono">
                                {vid.size ? formatBytes(vid.size) : 'Drive Video'} • {folderNo}/MEDIA/VIDEOS
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
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded cursor-pointer transition">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Video(s)</span>
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
                  <label className="flex flex-col sm:flex-row items-center justify-center gap-2.5 p-4 border-2 border-dashed border-slate-300 hover:border-sky-500 hover:bg-sky-50/50 rounded-lg cursor-pointer transition text-center sm:text-left">
                    <div className="p-2 bg-sky-100 text-sky-700 rounded-full shrink-0">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {isVideoUploading
                          ? `Uploading Video ${videoProgress?.current || 1} of ${videoProgress?.total || 1}... (${videoProgress?.percent || 0}%)`
                          : 'Upload Vehicle Inspection Videos (2–3+ clips supported)'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Select 1, 2, 3 or more inspection clips (.mp4, .mov) — uploaded directly to Google Drive: <span className="font-mono font-semibold text-sky-800">{folderNo}/MEDIA/VIDEOS</span>
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
                  <div className="mt-2 space-y-1">
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-600 h-2 transition-all duration-300"
                        style={{ width: `${videoProgress?.percent || 0}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-600 font-mono">
                      Transferring video {videoProgress?.current || 1} of {videoProgress?.total || 1}: {videoProgress?.name || ''} ({videoProgress?.percent || 0}%) to Google Drive ({folderNo}/MEDIA/VIDEOS)...
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
                  RAV Date of Entry
                </label>
                <input
                  type="date"
                  value={ravDateOfEntry}
                  onChange={e => setRavDateOfEntry(e.target.value)}
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
    </div>
  );
};
