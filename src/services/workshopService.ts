import { supabase } from '../lib/supabase';
import type { RawWorkshop } from '../types';

export const workshopService = {
  async getAll(): Promise<RawWorkshop[]> {
    // Try querying the summary view first, fallback to raw_workshops table
    const { data: viewData, error: viewError } = await supabase
      .from('v_raw_workshops_summary')
      .select('*')
      .order('raw_id', { ascending: true });

    if (!viewError && viewData) {
      return viewData as RawWorkshop[];
    }

    // Fallback: query raw_workshops directly
    const { data, error } = await supabase
      .from('raw_workshops')
      .select('*')
      .order('raw_id', { ascending: true });

    if (error) throw error;
    return (data || []) as RawWorkshop[];
  },

  async getById(rawId: string): Promise<RawWorkshop | null> {
    const { data, error } = await supabase
      .from('raw_workshops')
      .select('*')
      .eq('raw_id', rawId)
      .maybeSingle();

    if (error) throw error;
    return data as RawWorkshop | null;
  },

  async create(workshop: RawWorkshop): Promise<RawWorkshop> {
    const { data, error } = await supabase
      .from('raw_workshops')
      .insert([{
        raw_id: workshop.raw_id.toUpperCase().trim(),
        name: workshop.name.trim(),
        contact_email: workshop.contact_email?.trim() || null,
        contact_phone: workshop.contact_phone?.trim() || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return data as RawWorkshop;
  },

  async update(rawId: string, updates: Partial<RawWorkshop>): Promise<RawWorkshop> {
    const { data, error } = await supabase
      .from('raw_workshops')
      .update({
        name: updates.name?.trim(),
        contact_email: updates.contact_email?.trim() || null,
        contact_phone: updates.contact_phone?.trim() || null,
      })
      .eq('raw_id', rawId)
      .select()
      .single();

    if (error) throw error;
    return data as RawWorkshop;
  },

  async delete(rawId: string): Promise<void> {
    const { error } = await supabase
      .from('raw_workshops')
      .delete()
      .eq('raw_id', rawId);

    if (error) throw error;
  }
};

