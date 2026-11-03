import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ComplianceJob, Vehicle, RawWorkshop, ModelReport } from '../types';
import { formatDate } from '../lib/utils';

export const exportService = {
  exportToCsv(filename: string, data: any[]) {
    try {
      const csv = Papa.unparse(data || []);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export CSV error:', err);
      alert('Failed to export CSV. Please try again.');
    }
  },

  exportJobsPdf(jobs: ComplianceJob[]) {
    try {
      const doc = new jsPDF('landscape');
      
      // Header
      doc.setFontSize(18);
      doc.setTextColor(15, 92, 110); // Deep petrol
      doc.text('AVV MATE — VEHICLE COMPLIANCE REPORT', 14, 18);
      
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${new Date().toLocaleDateString()} | Authorised Vehicle Verifier (AVV) Portal`, 14, 24);

      const tableRows = (jobs || []).map(j => [
        j.folder_no || '—',
        j.vin || '—',
        j.raw_id || '—',
        j.raw_workshop_name || '—',
        j.mre_no || '—',
        `${j.make || ''} ${j.model || ''}`.trim() || '—',
        formatDate(j.request_received),
        `${j.uploaded_docs_count || 0}/8 Docs`,
        j.videos_url ? 'Yes' : 'No',
        formatDate(j.avv_verification_date),
        formatDate(j.rav_date_of_entry),
        (j.status || 'in_progress').toUpperCase()
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
    } catch (err) {
      console.error('Export Jobs PDF error:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  },

  exportVehiclesPdf(vehicles: Vehicle[]) {
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.setTextColor(15, 92, 110);
      doc.text('AVV MATE — REGISTERED VEHICLES', 14, 18);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Total: ${(vehicles || []).length} Vehicles | Generated: ${new Date().toLocaleDateString()}`, 14, 24);

      const rows = (vehicles || []).map(v => [
        v.vin || '—',
        v.build_date || '—',
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
    } catch (err) {
      console.error('Export Vehicles PDF error:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  },

  exportWorkshopsPdf(workshops: RawWorkshop[]) {
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.setTextColor(15, 92, 110);
      doc.text('AVV MATE — RAW WORKSHOPS DIRECTORY', 14, 18);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Total: ${(workshops || []).length} Workshops | Generated: ${new Date().toLocaleDateString()}`, 14, 24);

      const rows = (workshops || []).map(w => [
        w.raw_id || '—',
        w.name || '—',
        w.contact_email || '—',
        w.contact_phone || '—',
        String(w.total_vehicles || 0)
      ]);

      autoTable(doc, {
        startY: 28,
        head: [['RAW ID', 'Workshop Name', 'Email', 'Phone', 'Total Vehicles']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [15, 92, 110] },
        styles: { fontSize: 8 }
      });

      doc.save(`raw_workshops_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Export Workshops PDF error:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  },

  exportModelReportsPdf(reports: ModelReport[]) {
    try {
      const doc = new jsPDF('landscape');
      doc.setFontSize(18);
      doc.setTextColor(15, 92, 110);
      doc.text('AVV MATE — MODEL REPORTS (MRE) DIRECTORY', 14, 18);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Total: ${(reports || []).length} Reports | Generated: ${new Date().toLocaleDateString()}`, 14, 24);

      const rows = (reports || []).map(r => [
        r.mre_no || '—',
        r.make || '—',
        r.model || '—',
        r.sev_no || '—',
        r.vcc || '—',
        r.build_from || '—',
        r.build_to || '—',
        r.tare_kg ? `${r.tare_kg} kg` : '—',
        r.power_kw ? `${r.power_kw} kW` : '—',
        r.seats ? String(r.seats) : '—',
        r.author || '—'
      ]);

      autoTable(doc, {
        startY: 28,
        head: [['MRE #', 'Make', 'Model', 'SEV #', 'Category', 'Build From', 'Build To', 'Tare', 'Power', 'Seats', 'Author']],
        body: rows,
        theme: 'grid',
        headStyles: {
          fillColor: [15, 92, 110],
          textColor: 255,
          fontSize: 8,
          fontStyle: 'bold'
        },
        styles: { fontSize: 7.5, cellPadding: 2.5 }
      });

      doc.save(`model_reports_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Export Model Reports PDF error:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  }
};
