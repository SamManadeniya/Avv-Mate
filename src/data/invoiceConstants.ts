import type { PresetInvoiceService, Invoice } from '../types';

export const DEFAULT_COMPANY_DETAILS = {
  name: 'Model Reports Online',
  abn: '89 658 815 313',
  website: 'modelreportsonline.com.au',
  email: 'support@modelreportsonline.com.au',
  phone: '0402 750 571',
  bankAccount: {
    bank: 'GSB ( Great Southern Bank )',
    acName: 'Sydney Vehicle Compliance',
    bsb: '814 282',
    acNo: '51414735',
    ref: 'Invoice No.',
  },
  defaultNotes: `BANK ACCOUNT
Bank: GSB ( Great Southern Bank )
AC Name: Sydney Vehicle Compliance
BSB: 814 282
AC No: 51414735
REF: Invoice No.`,
  defaultTerms: 'Payment due on receipt. Please quote the Invoice Number as the reference for EFT/Direct Deposit payments. All vehicle RAV registrations and AVV verifications are finalized upon receipt of clearance.',
};

export const PRESET_INVOICE_SERVICES: PresetInvoiceService[] = [
  { name: 'AVV & RAV Entry', rate: 300.00, description: 'AVV verification and RAV entry portal submission' },
  { name: 'AVV Inspection', rate: 500.00, description: 'Physical vehicle inspection and AVV verification audit' },
  { name: 'Import Approval Cost', rate: 95.00, description: 'Concessional RAV entry government fee' },
  { name: 'Import Approval Processing Fee', rate: 50.00, description: 'ROVER document submission & processing handling fee' },
  { name: 'Discount : $50', rate: -50.00, description: 'Workshop compliance partner promotional discount' },
];

export const DEFAULT_SEED_INVOICES: Invoice[] = [
  {
    id: 'inv_1001',
    invoice_no: 'RAW000245-054',
    customer_name: 'NINETYNINE GROUP PTY LTD.',
    customer_address: '179 Parramatta Road,\nHaberfield\nNSW 2045\nAustralia',
    customer_email: 'accounts@ninetyninegroup.com.au',
    customer_phone: '0412 345 678',
    raw_id: 'RAW-000245',
    vin: '6ZZG000RC41015137',
    folder_no: 'SVC1045',
    invoice_date: '2026-11-04',
    terms: 'Due on Receipt',
    due_date: '2026-11-04',
    items: [
      {
        id: 'item_1',
        item_details: 'MRE-000618 : Honda Odyssey\nVIN : 6ZZG000RC41015137\nRAW ID : RAW-000245',
        quantity: 1,
        unit: 'pcs',
        rate: 200.00,
        tax_rate: 0.10,
        tax_name: 'GST [10%]',
        amount: 200.00,
      },
      {
        id: 'item_2',
        item_details: 'AVV & RAV Entry\nVIN : 6ZZG000RC41015137',
        quantity: 1,
        unit: 'pcs',
        rate: 300.00,
        tax_rate: 0.10,
        tax_name: 'GST [10%]',
        amount: 300.00,
      },
    ],
    subtotal: 500.00,
    tax_amount: 50.00,
    total_amount: 550.00,
    balance_due: 550.00,
    status: 'sent',
    customer_notes: DEFAULT_COMPANY_DETAILS.defaultNotes,
    terms_and_conditions: DEFAULT_COMPANY_DETAILS.defaultTerms,
    created_at: '2026-11-04T07:00:00.000Z',
    updated_at: '2026-11-04T07:00:00.000Z',
  },
];

