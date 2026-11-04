import type { RawWorkshop } from '../types';
import { googleSheetsService } from './googleSheetsService';
import { DEFAULT_RAW_WORKSHOPS } from '../data/seedData';

export const workshopService = {
  async getAll(): Promise<RawWorkshop[]> {
    const cached = googleSheetsService.getCachedMasterData();
    if (cached?.workshops && cached.workshops.length > 0) {
      return cached.workshops;
    }
    return DEFAULT_RAW_WORKSHOPS;
  },

  async getById(rawId: string): Promise<RawWorkshop | null> {
    const workshops = await this.getAll();
    const cleanId = rawId.toUpperCase().trim();
    return workshops.find(w => w.raw_id.toUpperCase() === cleanId) || null;
  },

  async create(workshop: RawWorkshop): Promise<RawWorkshop> {
    const currentWorkshops = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanId = workshop.raw_id.toUpperCase().trim();
    const newWorkshop: RawWorkshop = {
      ...workshop,
      raw_id: cleanId,
      created_at: workshop.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedWorkshops = [newWorkshop, ...currentWorkshops.filter(w => w.raw_id.toUpperCase() !== cleanId)];

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: cached?.vehicles || [],
      workshops: updatedWorkshops,
      modelReports: cached?.modelReports || [],
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        cached?.vehicles || [],
        updatedWorkshops,
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return newWorkshop;
  },

  async update(rawId: string, updates: Partial<RawWorkshop>): Promise<RawWorkshop> {
    const currentWorkshops = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanId = rawId.toUpperCase().trim();
    const idx = currentWorkshops.findIndex(w => w.raw_id.toUpperCase() === cleanId);
    if (idx === -1) {
      throw new Error(`RAW Workshop with ID ${rawId} not found.`);
    }

    const existing = currentWorkshops[idx];
    const updatedWorkshop: RawWorkshop = {
      ...existing,
      ...updates,
      raw_id: cleanId,
      updated_at: new Date().toISOString(),
    };

    const updatedWorkshops = [...currentWorkshops];
    updatedWorkshops[idx] = updatedWorkshop;

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: cached?.vehicles || [],
      workshops: updatedWorkshops,
      modelReports: cached?.modelReports || [],
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        cached?.vehicles || [],
        updatedWorkshops,
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return updatedWorkshop;
  },

  async delete(rawId: string): Promise<void> {
    const currentWorkshops = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanId = rawId.toUpperCase().trim();
    const updatedWorkshops = currentWorkshops.filter(w => w.raw_id.toUpperCase() !== cleanId);

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: cached?.vehicles || [],
      workshops: updatedWorkshops,
      modelReports: cached?.modelReports || [],
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        cached?.vehicles || [],
        updatedWorkshops,
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }
  }
};
