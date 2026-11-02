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
  Sparkles
} from 'lucide-react';
import type { ComplianceJob, RawWorkshop } from '../../types';
import { messagingService, type GeneratedTemplates } from '../../services/messagingService';

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

  const matchedWorkshop = workshops.find(
    w => w.raw_id === job?.raw_id || w.name === job?.raw_workshop_name
  );

  const [templates, setTemplates] = useState<GeneratedTemplates | null>(null);

  useEffect(() => {
    if (!isOpen || !job) return;

    const t = messagingService.generateMissingDocsTemplate(job, matchedWorkshop);
    setTemplates(t);

    setRecipientPhone(matchedWorkshop?.contact_phone || '');
    setRecipientEmail(matchedWorkshop?.contact_email || '');
    setApiFeedback(null);
    setCopied(false);
  }, [isOpen, job, matchedWorkshop]);

  if (!isOpen || !job || !templates) return null;

  const handleCopy = () => {
    const textToCopy = activeChannel === 'whatsapp' ? templates.whatsappMessage : templates.emailBody;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsAppWeb = () => {
    if (!recipientPhone.trim()) {
      alert('Please enter a recipient phone number first.');
      return;
    }
    const url = messagingService.getWhatsAppWebUrl(recipientPhone, templates.whatsappMessage);
    window.open(url, '_blank');
  };

  const handleOpenEmailClient = () => {
    if (!recipientEmail.trim()) {
      alert('Please enter a recipient email address first.');
      return;
    }
    const url = messagingService.getEmailMailtoUrl(recipientEmail, templates.subject, templates.emailBody);
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
      templates.whatsappMessage
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
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
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
              <span className="text-xs font-semibold text-slate-500 font-mono">
                {templates.receivedDocs.length}/8 on file
              </span>
            </div>

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

            {templates.receivedDocs.length > 0 && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Already Received: <b>{templates.receivedDocs.map(d => d.label).join(', ')}</b></span>
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

          {/* Channel Tabs */}
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
                  <span>WhatsApp Message Preview</span>
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
                  <span>Email Template Preview</span>
                </button>
              </div>

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

            {/* Template Preview Content */}
            {activeChannel === 'whatsapp' ? (
              <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-lg p-4 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {templates.whatsappMessage}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs">
                  <span className="font-semibold text-slate-500">Subject: </span>
                  <span className="font-semibold text-slate-900">{templates.subject}</span>
                </div>
                <div className="bg-slate-50/60 border border-slate-200 rounded-lg p-4 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                  {templates.emailBody}
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
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow transition"
              title="Opens WhatsApp Web with message pre-filled"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleSendDirectWhatsAppApi}
              disabled={isSendingApi}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-md shadow transition disabled:opacity-50"
              title="Sends via Meta WhatsApp Cloud API"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{isSendingApi ? 'Sending…' : 'Send via Cloud API'}</span>
            </button>

            {/* Email Action */}
            <button
              type="button"
              onClick={handleOpenEmailClient}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-md shadow transition"
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
