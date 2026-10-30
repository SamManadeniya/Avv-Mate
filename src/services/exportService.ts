import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ComplianceJob, Vehicle } from '../types';
import { formatDate } from '../lib/utils';

export const exportService = {
  exportToCsv(filename: string, data: any[]) {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportJobsPdf(jobs: ComplianceJob[]) {
    const doc = new jsPDF('landscape');
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(15, 92, 110); // Deep petrol
    doc.text('AVV MATE — VEHICLE COMPLIANCE REPORT', 14, 18);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | Authorised Vehicle Verifier (AVV) Portal`, 14, 24);

    const tableRows = jobs.map(j => [
      j.folder_no,
      j.vin,
      j.raw_id || '—',
      j.raw_workshop_name || '—',
      j.mre_no || '—',
      `${j.make || ''} ${j.model || ''}`.trim() || '—',
      formatDate(j.request_received),
      `${j.uploaded_docs_count || 0}/8 Docs`,
      j.videos_url ? 'Yes' : 'No',
      formatDate(j.avv_verification_date),
      formatDate(j.rav_date_of_entry),
      j.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['Folder #', 'VIN #', 'RAW ID', 'Workshop Name', 'MRE #', 'Vehicle', 'Received', 'Docs', 'Video', 'AVV Date', 'RAV Date', 'Status']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 92, 110],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    doc.save(`avv_compliance_jobs_${new Date().toISOString().slice(0, 10)}.pdf`);
  },

  exportVehiclesPdf(vehicles: Vehicle[]) {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(15, 92, 110);
    doc.text('AVV MATE — REGISTERED VEHICLES', 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${vehicles.length} Vehicles | Generated: ${new Date().toLocaleDateString()}`, 14, 24);

    const rows = vehicles.map(v => [
      v.vin,
      v.build_date,
      v.via_no || '—',
      v.raw_id || '—',
      v.raw_workshop_name || '—',
      v.mre_no || '—',
      `${v.make || ''} ${v.model || ''}`.trim() || '—'
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['VIN', 'Build Date', 'VIA #', 'RAW ID', 'Workshop Name', 'MRE #', 'Make / Model']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [15, 92, 110] },
      styles: { fontSize: 8 }
    });

    doc.save(`vehicles_master_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
};
