import type { Vehicle } from '../types';
import { googleSheetsService } from './googleSheetsService';
import { DEFAULT_VEHICLES } from '../data/seedData';

export const vehicleService = {
  async getAll(): Promise<Vehicle[]> {
    const cached = googleSheetsService.getCachedMasterData();
    if (cached?.vehicles && cached.vehicles.length > 0) {
      return cached.vehicles;
    }
    return DEFAULT_VEHICLES;
  },

  async getByVin(vin: string): Promise<Vehicle | null> {
    const vehicles = await this.getAll();
    const cleanVin = vin.toUpperCase().trim();
    return vehicles.find(v => v.vin.toUpperCase() === cleanVin) || null;
  },

  async create(vehicle: Vehicle): Promise<Vehicle> {
    const currentVehicles = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanVin = vehicle.vin.toUpperCase().trim();
    const newVehicle: Vehicle = {
      ...vehicle,
      vin: cleanVin,
      created_at: vehicle.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedVehicles = [newVehicle, ...currentVehicles.filter(v => v.vin.toUpperCase() !== cleanVin)];

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: updatedVehicles,
      workshops: cached?.workshops || [],
      modelReports: cached?.modelReports || [],
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        updatedVehicles,
        cached?.workshops || [],
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return newVehicle;
  },

  async update(vin: string, updates: Partial<Vehicle>): Promise<Vehicle> {
    const currentVehicles = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanVin = vin.toUpperCase().trim();
    const idx = currentVehicles.findIndex(v => v.vin.toUpperCase() === cleanVin);
    if (idx === -1) {
      throw new Error(`Vehicle with VIN ${vin} not found.`);
    }

    const existing = currentVehicles[idx];
    const updatedVehicle: Vehicle = {
      ...existing,
      ...updates,
      vin: cleanVin,
      updated_at: new Date().toISOString(),
    };

    const updatedVehicles = [...currentVehicles];
    updatedVehicles[idx] = updatedVehicle;

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: updatedVehicles,
      workshops: cached?.workshops || [],
      modelReports: cached?.modelReports || [],
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        updatedVehicles,
        cached?.workshops || [],
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }

    return updatedVehicle;
  },

  async delete(vin: string): Promise<void> {
    const currentVehicles = await this.getAll();
    const cached = googleSheetsService.getCachedMasterData();

    const cleanVin = vin.toUpperCase().trim();
    const updatedVehicles = currentVehicles.filter(v => v.vin.toUpperCase() !== cleanVin);

    googleSheetsService.setCachedMasterData({
      jobs: cached?.jobs || [],
      vehicles: updatedVehicles,
      workshops: cached?.workshops || [],
      modelReports: cached?.modelReports || [],
    });

    if (googleSheetsService.isConfigured()) {
      googleSheetsService.syncAllDataToMasterSheet(
        cached?.jobs || [],
        updatedVehicles,
        cached?.workshops || [],
        cached?.modelReports || []
      ).catch(e => console.warn('Background master sheet sync notice:', e));
    }
  }
};
