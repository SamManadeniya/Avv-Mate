import type { ComplianceJob, RawWorkshop, DocType } from '../types';
import { REQUIRED_DOC_TYPES } from '../types';

export interface GeneratedTemplates {
  missingDocs: { type: DocType; label: string; name: string }[];
  receivedDocs: { type: DocType; label: string }[];
  subject: string;
  emailBody: string;
  whatsappMessage: string;
}

export const messagingService = {
  generateMissingDocsTemplate(
    job: ComplianceJob,
    workshop?: RawWorkshop | null
  ): GeneratedTemplates {
    const attachedTypes = new Set<DocType>();
    if (job.attachments) {
      Object.entries(job.attachments).forEach(([type, att]) => {
        if (att) attachedTypes.add(type as DocType);
      });
    }

    const missingDocs: { type: DocType; label: string; name: string }[] = [];
    const receivedDocs: { type: DocType; label: string }[] = [];

    REQUIRED_DOC_TYPES.forEach(doc => {
      if (attachedTypes.has(doc.type)) {
        receivedDocs.push({ type: doc.type, label: doc.label });
      } else {
        missingDocs.push({ type: doc.type, label: doc.label, name: doc.name });
      }
    });

    const clientName = workshop?.name || job.raw_workshop_name || job.raw_id || 'Valued Workshop Client';
    const vehicleDesc = [job.make, job.model].filter(Boolean).join(' ') || 'Vehicle';
    const folder = job.folder_no;
    const vin = job.vin;

    // Email Subject
    const subject = `Action Required: Missing Compliance Documents for ${vehicleDesc} (VIN: ${vin}) [${folder}]`;

    // Email Body
    const missingListEmail = missingDocs
      .map((d, i) => `  ${i + 1}. [${d.label}] ${d.name}`)
      .join('\n');

    const receivedListEmail = receivedDocs.length > 0 
      ? receivedDocs.map(d => d.label).join(', ') 
      : 'None yet';

    const countTextEmail = missingDocs.length === 1 ? '1 outstanding document' : `${missingDocs.length} outstanding documents`;
    const countTextWA = missingDocs.length === 1 ? '1 missing document' : `${missingDocs.length} missing documents`;

    const emailBody = `Dear ${clientName},

We are currently completing the Authorised Vehicle Verifier (AVV) compliance verification for your vehicle:

  • Vehicle: ${vehicleDesc}
  • Folder #: ${folder}
  • VIN #: ${vin}
  • Request Received: ${job.request_received || 'Recorded'}
  • VIA #: ${job.via_no || 'N/A'}

To finalize AVV verification and submit the entry onto the national Register of Approved Vehicles (RAV), we still require the following ${countTextEmail}:

${missingListEmail}

(Documents already on file: ${receivedListEmail} ✓)

Please reply with these attachments (PDF, JPG, or PNG) at your earliest convenience so we can proceed with the physical verification inspection.

Kind regards,
AVV Verification & Compliance Team
AVV Mate Operational Services`;

    // WhatsApp Message (Styled with WhatsApp markdown)
    const missingListWA = missingDocs
      .map((d, i) => `*${i + 1}. ${d.label}* — ${d.name}`)
      .join('\n');

    const whatsappMessage = `*AVV COMPLIANCE ALERT — MISSING DOCUMENTS* 📋

Hi *${clientName}*,

We are processing AVV verification for your vehicle:
🚗 *${vehicleDesc}*
📁 Folder: *${folder}*
🔢 VIN: *${vin}*

To finalize verification and complete RAV registration, please provide the following *${countTextWA}*:

${missingListWA}

${receivedDocs.length > 0 ? `_Documents already received: ${receivedDocs.map(d => d.label).join(', ')} ✅_\n` : ''}
Please reply with these files (PDF / Photos) so we can inspect and clear your vehicle without delay.

Thank you!
*AVV Mate Verification Team*`;

    return {
      missingDocs,
      receivedDocs,
      subject,
      emailBody,
      whatsappMessage
    };
  },

  getWhatsAppWebUrl(phoneNumber: string, message: string): string {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  },

  getEmailMailtoUrl(email: string, subject: string, body: string): string {
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },

  async sendDirectWhatsAppApi(toPhone: string, message: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const phoneNumberId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || '1264516496745460';
    const accessToken = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;

    if (!accessToken) {
      return { success: false, error: 'WhatsApp Access Token is not configured in environment variables.' };
    }

    const cleanPhone = toPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      return { success: false, error: 'Recipient phone number is invalid.' };
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: message
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || `WhatsApp API error (HTTP ${response.status})`
        };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error calling WhatsApp API' };
    }
  }
};

