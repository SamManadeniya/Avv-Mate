import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '—';
  // If it's already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
  const parts = dateString.split(/[-T]/);
  if (parts.length >= 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return dateString;
}

export function formatMonth(dateString?: string | null): string {
  if (!dateString) return '—';
  if (/^\d{2}\/\d{4}$/.test(dateString)) return dateString;
  const parts = dateString.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

export function validateVin(vin: string): { valid: boolean; message?: string } {
  const cleanVin = vin.toUpperCase().replace(/\s/g, '');
  if (!cleanVin) return { valid: false, message: 'VIN is required' };
  if (cleanVin.length !== 17) {
    return { valid: false, message: `VIN must be exactly 17 characters (currently ${cleanVin.length})` };
  }
  if (/[IOQ]/.test(cleanVin)) {
    return { valid: false, message: 'VIN cannot contain letters I, O, or Q (use 1 or 0)' };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
    return { valid: false, message: 'VIN contains invalid characters' };
  }
  return { valid: true };
}

export function getNextFolderNumber(lastFolder?: string | null): string {
  if (!lastFolder) return 'SVC1001';
  const match = /^([A-Za-z]+)(\d+)$/.exec(lastFolder.trim());
  if (!match) return 'SVC1001';
  const prefix = match[1];
  const num = parseInt(match[2], 10) + 1;
  return `${prefix}${String(num).padStart(match[2].length, '0')}`;
}

export function formatBytes(bytes?: number | null, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

