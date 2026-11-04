import type { Invoice } from '../types';
import { DEFAULT_SEED_INVOICES } from '../data/invoiceConstants';

class InvoiceService {
  private readonly STORAGE_KEY = 'avv_mate_invoices_cache';

  public async getAll(): Promise<Invoice[]> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    return DEFAULT_SEED_INVOICES;
  }

  public async getById(id: string): Promise<Invoice | null> {
    const list = await this.getAll();
    return list.find(inv => inv.id === id) || null;
  }

  public async create(data: Omit<Invoice, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Invoice> {
    const current = await this.getAll();
    const newInvoice: Invoice = {
      ...data,
      id: data.id || `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = [newInvoice, ...current];
    this.saveToStorage(updated);
    return newInvoice;
  }

  public async update(id: string, updates: Partial<Invoice>): Promise<Invoice> {
    const current = await this.getAll();
    const idx = current.findIndex(inv => inv.id === id);
    if (idx === -1) {
      throw new Error(`Invoice with ID ${id} not found.`);
    }

    const updatedInvoice: Invoice = {
      ...current[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const updated = [...current];
    updated[idx] = updatedInvoice;
    this.saveToStorage(updated);
    return updatedInvoice;
  }

  public async delete(id: string): Promise<void> {
    const current = await this.getAll();
    const updated = current.filter(inv => inv.id !== id);
    this.saveToStorage(updated);
  }

  public generateNextInvoiceNo(rawId?: string | null): string {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const list: Invoice[] = raw ? JSON.parse(raw) : DEFAULT_SEED_INVOICES;
      const count = list.length + 1;
      const seqStr = String(count).padStart(3, '0');

      if (rawId) {
        // e.g. RAW-000245 -> RAW000245-055
        const cleanRaw = rawId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        return `${cleanRaw}-${seqStr}`;
      }
      return `INV-${seqStr}`;
    } catch (_) {
      return `INV-001`;
    }
  }

  private saveToStorage(invoices: Invoice[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(invoices));
      window.dispatchEvent(new CustomEvent('avv_mate_invoices_updated', { detail: invoices }));
    } catch (e) {
      console.error('Failed to save invoices to localStorage:', e);
    }
  }
}

export const invoiceService = new InvoiceService();
