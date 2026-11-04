import type { ModelReport } from '../types';
import { googleSheetsService } from './googleSheetsService';
import { DEFAULT_MODEL_REPORTS } from '../data/seedData';

export const modelReportService = {
  async getAll(): Promise<ModelReport[]> {
    const cached = googleSheetsService.getCachedMasterData();
    if (cached?.modelReports && cached.modelReports.length > 0) {
      return cached.modelReports;
    }
    return DEFAULT_MODEL_REPORTS;
  },

  async getByMreNo(mreNo: string): Promise<ModelReport | null> {
    const reports = await this.getAll();
    const cleanNo = mreNo.toUpperCase().trim();
    return reports.find(r => r.mre_no.toUpperCase() === cleanNo) || null;
  },

  async create(report: ModelReport): Promise<ModelReport> {
    const currentReports = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanNo = report.mre_no.toUpperCase().trim();
    const cleanUniqueId = report.unique_id ? report.unique_id.trim() : null;

    const newReport: ModelReport = {
      ...report,
      mre_no: cleanNo,
      unique_id: cleanUniqueId,
      created_at: report.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedReports = [newReport, ...currentReports.filter(r => r.mre_no.toUpperCase() !== cleanNo)];

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: cached?.vehicles || [],
      workshops: cached?.workshops || [],
      modelReports: updatedReports,
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        cached?.vehicles || [],
        cached?.workshops || [],
        updatedReports
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return newReport;
  },

  async update(mreNo: string, updates: Partial<ModelReport>): Promise<ModelReport> {
    const currentReports = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanNo = mreNo.toUpperCase().trim();
    const idx = currentReports.findIndex(r => r.mre_no.toUpperCase() === cleanNo);
    if (idx === -1) {
      throw new Error(`Model Report with MRE No ${mreNo} not found.`);
    }

    const existing = currentReports[idx];
    const cleanUniqueId = updates.unique_id !== undefined ? (updates.unique_id ? updates.unique_id.trim() : null) : existing.unique_id;

    const updatedReport: ModelReport = {
      ...existing,
      ...updates,
      mre_no: cleanNo,
      unique_id: cleanUniqueId,
      updated_at: new Date().toISOString(),
    };

    const updatedReports = [...currentReports];
    updatedReports[idx] = updatedReport;

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: cached?.vehicles || [],
      workshops: cached?.workshops || [],
      modelReports: updatedReports,
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        cached?.vehicles || [],
        cached?.workshops || [],
        updatedReports
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return updatedReport;
  },

  async delete(mreNo: string): Promise<void> {
    const currentReports = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanNo = mreNo.toUpperCase().trim();
    const updatedReports = currentReports.filter(r => r.mre_no.toUpperCase() !== cleanNo);

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: cached?.vehicles || [],
      workshops: cached?.workshops || [],
      modelReports: updatedReports,
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        cached?.vehicles || [],
        cached?.workshops || [],
        updatedReports
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }
  }
};
