import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail, 
  Copy, 
  Check, 
  AlertCircle, 
  MessageSquare, 
  ExternalLink, 
  Phone, 
  Layers, 
  Sparkles,
  RotateCcw,
  Edit3
} from 'lucide-react';
import type { ComplianceJob, RawWorkshop, DocType, JobAttachment } from '../../types';
import { messagingService, type GeneratedTemplates } from '../../services/messagingService';
import { attachmentService } from '../../services/attachmentService';

interface RequestDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ComplianceJob | null;
  workshops: RawWorkshop[];
}

export const RequestDocsModal: React.FC<RequestDocsModalProps> = ({
  isOpen,
  onClose,
  job,
  workshops,
}) => {
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSendingApi, setIsSendingApi] = useState(false);
  const [apiFeedback, setApiFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Editable custom messages
  const [customWhatsAppMessage, setCustomWhatsAppMessage] = useState('');
  const [customEmailSubject, setCustomEmailSubject] = useState('');
  const [customEmailBody, setCustomEmailBody] = useState('');
  const [isEdited, setIsEdited] = useState(false);

  const matchedWorkshop = workshops.find(
    w => w.raw_id === job?.raw_id || w.name === job?.raw_workshop_name
  );

  const [templates, setTemplates] = useState<GeneratedTemplates | null>(null);

  useEffect(() => {
    if (!isOpen || !job) return;

    let isMounted = true;

    // 1. Generate template immediately from current job state (contains live Master Sheet attachments)
    const initialT = messagingService.generateMissingDocsTemplate(job, matchedWorkshop);
    setTemplates(initialT);
    setCustomWhatsAppMessage(initialT.whatsappMessage);
    setCustomEmailSubject(initialT.subject);
    setCustomEmailBody(initialT.emailBody);
    setIsEdited(false);

    // 2. Only if Supabase has valid live attachments, merge them without wiping existing attachments
    attachmentService.getByJobId(job.id).then((liveAttachments: Record<DocType, JobAttachment | null>) => {
      if (!isMounted) return;
      const hasValidLiveAtts = Object.values(liveAttachments || {}).some(a => Boolean(a && (a.file_url || a.file_name)));
      if (hasValidLiveAtts) {
        const mergedAttachments: Record<DocType, JobAttachment | null> = {
          CRE: null, EC: null, CIN: null, WI: null,
          DC: null, VI: null, RAW_DECLA: null, PHOTOS: null,
          ...(job.attachments || {}),
        };
        Object.entries(liveAttachments).forEach(([k, v]) => {
          if (v && (v.file_url || v.file_name)) {
            mergedAttachments[k as DocType] = v;
          }
        });
        const jobWithLiveAtts: ComplianceJob = {
          ...job,
          attachments: mergedAttachments
        };
        const updatedT = messagingService.generateMissingDocsTemplate(jobWithLiveAtts, matchedWorkshop);
        setTemplates(updatedT);
        setCustomWhatsAppMessage(updatedT.whatsappMessage);
        setCustomEmailSubject(updatedT.subject);
        setCustomEmailBody(updatedT.emailBody);
      }
    }).catch((err: unknown) => {
      console.warn('Failed to load live attachments for template, using current job state:', err);
    });

    setRecipientPhone(matchedWorkshop?.contact_phone || '');
    setRecipientEmail(matchedWorkshop?.contact_email || '');
    setApiFeedback(null);
    setCopied(false);

    return () => {
      isMounted = false;
    };
  }, [isOpen, job, matchedWorkshop]);

  if (!isOpen || !job || !templates) return null;

  const handleResetToDefault = () => {
    if (!templates) return;
    setCustomWhatsAppMessage(templates.whatsappMessage);
    setCustomEmailSubject(templates.subject);
    setCustomEmailBody(templates.emailBody);
    setIsEdited(false);
  };

  const handleCopy = () => {
    const textToCopy = activeChannel === 'whatsapp' ? customWhatsAppMessage : customEmailBody;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsAppWeb = () => {
    if (!recipientPhone.trim()) {
      alert('Please enter a recipient phone number first.');
      return;
    }
    const url = messagingService.getWhatsAppWebUrl(recipientPhone, customWhatsAppMessage);
    window.open(url, '_blank');
  };

  const handleOpenEmailClient = () => {
    if (!recipientEmail.trim()) {
      alert('Please enter a recipient email address first.');
      return;
    }
    const url = messagingService.getEmailMailtoUrl(recipientEmail, customEmailSubject, customEmailBody);
    window.location.href = url;
  };

  const handleSendDirectWhatsAppApi = async () => {
    if (!recipientPhone.trim()) {
      setApiFeedback({ success: false, message: 'Recipient phone number is required.' });
      return;
    }

    setIsSendingApi(true);
    setApiFeedback(null);

    const result = await messagingService.sendDirectWhatsAppApi(
      recipientPhone,
      customWhatsAppMessage
    );

    setIsSendingApi(false);
    if (result.success) {
      setApiFeedback({ success: true, message: 'WhatsApp message sent successfully via Cloud API!' });
    } else {
      setApiFeedback({
        success: false,
        message: result.error || 'Failed to send via WhatsApp Cloud API. You can still use the "Open in WhatsApp" button.'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-4 sm:my-8 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                  REQUEST MISSING COMPLIANCE DOCUMENTS
                </h2>
                <span className={`font-mono text-xs px-2 py-0.5 rounded font-semibold ${
                  templates.missingDocs.length === 0 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {templates.missingDocs.length} Missing
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Folder: <span className="font-mono font-semibold text-slate-700">{job.folder_no}</span> • 
                VIN: <span className="font-mono font-semibold text-slate-700">{job.vin}</span> • 
                Workshop: <span className="font-semibold text-slate-700">{job.raw_workshop_name || job.raw_id || 'Client'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
          {/* Missing vs Received Status Pills */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 font-display flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-700" />
                Live Document Status For This Vehicle
              </span>
              <span className="text-xs font-semibold text-slate-600 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                {templates.receivedDocs.length}/8 on file
              </span>
            </div>

            {templates.missingDocs.length === 0 ? (
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 p-2 rounded border border-emerald-200">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>All 8 required compliance documents are verified and attached!</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {templates.missingDocs.map(doc => (
                  <span
                    key={doc.type}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold bg-red-100 text-red-800 border border-red-200"
                  >
                    <AlertCircle className="w-3 h-3 text-red-600" />
                    Missing {doc.label} ({doc.name})
                  </span>
                ))}
              </div>
            )}

            {templates.receivedDocs.length > 0 && (
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-200/60">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Already Received ({templates.receivedDocs.length}): <b className="text-slate-800 font-mono">{templates.receivedDocs.map(d => d.label).join(', ')}</b></span>
              </div>
            )}
          </div>

          {/* Contact Details (Editable) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                Recipient WhatsApp / Mobile Number
              </label>
              <input
                type="text"
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
                placeholder="+61 412 345 678"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Recipient Workshop Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="compliance@workshop.com.au"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Interactive Channel Tabs & Custom Template Editor */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 mb-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveChannel('whatsapp')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition ${
                    activeChannel === 'whatsapp'
                      ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp Message Editor</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannel('email')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition ${
                    activeChannel === 'email'
                      ? 'border-sky-600 text-sky-800 bg-sky-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5 text-sky-600" />
                  <span>Email Template Editor</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {isEdited && (
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded transition"
                    title="Reset message to dynamic auto-generated template"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-600" />
                    <span>Reset to Default</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Custom Editable Message Editor */}
            {activeChannel === 'whatsapp' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span className="flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                    Custom WhatsApp Text (Editable)
                  </span>
                  <span>{customWhatsAppMessage.length} characters</span>
                </div>
                <textarea
                  value={customWhatsAppMessage}
                  onChange={e => {
                    setCustomWhatsAppMessage(e.target.value);
                    setIsEdited(true);
                  }}
                  rows={8}
                  className="w-full bg-emerald-50/30 border border-emerald-300 rounded-lg p-3.5 font-mono text-xs text-slate-800 leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-y shadow-2xs"
                  placeholder="Type or customize your WhatsApp message..."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Email Subject Line (Editable)
                  </label>
                  <input
                    type="text"
                    value={customEmailSubject}
                    onChange={e => {
                      setCustomEmailSubject(e.target.value);
                      setIsEdited(true);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mb-1">
                    <span className="flex items-center gap-1">
                      <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                      Email Body (Editable)
                    </span>
                    <span>{customEmailBody.length} characters</span>
                  </div>
                  <textarea
                    value={customEmailBody}
                    onChange={e => {
                      setCustomEmailBody(e.target.value);
                      setIsEdited(true);
                    }}
                    rows={8}
                    className="w-full bg-slate-50/60 border border-slate-300 rounded-lg p-3.5 text-xs text-slate-800 leading-relaxed focus:ring-2 focus:ring-sky-500 focus:bg-white resize-y shadow-2xs font-mono"
                    placeholder="Type or customize your email body..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* API Feedback Alert */}
          {apiFeedback && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
                apiFeedback.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
            >
              {apiFeedback.success ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{apiFeedback.message}</span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-100 transition"
          >
            Close
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {/* WhatsApp Actions */}
            <button
              type="button"
              onClick={handleOpenWhatsAppWeb}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-2xs transition"
              title="Opens WhatsApp Web with message pre-filled"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleSendDirectWhatsAppApi}
              disabled={isSendingApi}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-md shadow-2xs transition disabled:opacity-50"
              title="Sends via Meta WhatsApp Cloud API"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{isSendingApi ? 'Sending…' : 'Send via Cloud API'}</span>
            </button>

            {/* Email Action */}
            <button
              type="button"
              onClick={handleOpenEmailClient}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow-2xs transition"
              title="Opens your desktop/web mail client (Gmail/Outlook)"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Open in Email</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
