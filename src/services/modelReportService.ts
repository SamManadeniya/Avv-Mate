import { supabase } from '../lib/supabase';
import type { ModelReport } from '../types';

export const modelReportService = {
  async getAll(): Promise<ModelReport[]> {
    const { data, error } = await supabase
      .from('model_reports')
      .select('*')
      .order('mre_no', { ascending: true });

    if (error) throw error;
    return (data || []) as ModelReport[];
  },

  async getByNo(mreNo: string): Promise<ModelReport | null> {
    const { data, error } = await supabase
      .from('model_reports')
      .select('*')
      .eq('mre_no', mreNo)
      .maybeSingle();

    if (error) throw error;
    return data as ModelReport | null;
  },

  async create(report: ModelReport): Promise<ModelReport> {
    const { data, error } = await supabase
      .from('model_reports')
      .insert([{
        mre_no: report.mre_no.toUpperCase().trim(),
        make: report.make.trim(),
        model: report.model.trim(),
        sev_no: report.sev_no?.trim() || null,
        build_from: report.build_from || null,
        build_to: report.build_to || null,
        sev_build_from: report.sev_build_from || null,
        sev_build_to: report.sev_build_to || null,
        vcc: report.vcc?.trim() || null,
        tare_kg: report.tare_kg ? Number(report.tare_kg) : null,
        power_kw: report.power_kw ? Number(report.power_kw) : null,
        seats: report.seats ? Number(report.seats) : null,
        author: report.author?.trim() || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return data as ModelReport;
  },

  async update(mreNo: string, updates: Partial<ModelReport>): Promise<ModelReport> {
    const { data, error } = await supabase
      .from('model_reports')
      .update({
        make: updates.make?.trim(),
        model: updates.model?.trim(),
        sev_no: updates.sev_no?.trim() || null,
        build_from: updates.build_from || null,
        build_to: updates.build_to || null,
        sev_build_from: updates.sev_build_from || null,
        sev_build_to: updates.sev_build_to || null,
        vcc: updates.vcc?.trim() || null,
        tare_kg: updates.tare_kg !== undefined ? (updates.tare_kg ? Number(updates.tare_kg) : null) : undefined,
        power_kw: updates.power_kw !== undefined ? (updates.power_kw ? Number(updates.power_kw) : null) : undefined,
        seats: updates.seats !== undefined ? (updates.seats ? Number(updates.seats) : null) : undefined,
        author: updates.author !== undefined ? (updates.author?.trim() || null) : undefined,
      })
      .eq('mre_no', mreNo)
      .select()
      .single();

    if (error) throw error;
    return data as ModelReport;
  },

  async delete(mreNo: string): Promise<void> {
    const { error } = await supabase
      .from('model_reports')
      .delete()
      .eq('mre_no', mreNo);

    if (error) throw error;
  }
};

