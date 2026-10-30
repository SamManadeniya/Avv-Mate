import { supabase } from '../lib/supabase';
import type { Vehicle } from '../types';

export const vehicleService = {
  async getAll(): Promise<Vehicle[]> {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        vin,
        build_date,
        via_no,
        raw_id,
        mre_no,
        created_at,
        updated_at,
        raw_workshops ( name ),
        model_reports ( make, model )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      vin: row.vin,
      build_date: row.build_date,
      via_no: row.via_no,
      raw_id: row.raw_id,
      raw_workshop_name: row.raw_workshops?.name || null,
      mre_no: row.mre_no,
      make: row.model_reports?.make || null,
      model: row.model_reports?.model || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  },

  async getByVin(vin: string): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        vin,
        build_date,
        via_no,
        raw_id,
        mre_no,
        created_at,
        updated_at,
        raw_workshops ( name ),
        model_reports ( make, model )
      `)
      .eq('vin', vin.toUpperCase().trim())
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row: any = data;
    return {
      vin: row.vin,
      build_date: row.build_date,
      via_no: row.via_no,
      raw_id: row.raw_id,
      raw_workshop_name: row.raw_workshops?.name || null,
      mre_no: row.mre_no,
      make: row.model_reports?.make || null,
      model: row.model_reports?.model || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async create(vehicle: Vehicle): Promise<Vehicle> {
    const cleanVin = vehicle.vin.toUpperCase().replace(/\s/g, '');
    const { data, error } = await supabase
      .from('vehicles')
      .insert([{
        vin: cleanVin,
        build_date: vehicle.build_date.trim(),
        via_no: vehicle.via_no?.trim() || null,
        raw_id: vehicle.raw_id || null,
        mre_no: vehicle.mre_no || null,
      }])
      .select(`
        vin,
        build_date,
        via_no,
        raw_id,
        mre_no,
        created_at,
        updated_at,
        raw_workshops ( name ),
        model_reports ( make, model )
      `)
      .single();

    if (error) throw error;
    const row: any = data;
    return {
      vin: row.vin,
      build_date: row.build_date,
      via_no: row.via_no,
      raw_id: row.raw_id,
      raw_workshop_name: row.raw_workshops?.name || null,
      mre_no: row.mre_no,
      make: row.model_reports?.make || null,
      model: row.model_reports?.model || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async update(vin: string, updates: Partial<Vehicle>): Promise<Vehicle> {
    const { data, error } = await supabase
      .from('vehicles')
      .update({
        build_date: updates.build_date?.trim(),
        via_no: updates.via_no?.trim() || null,
        raw_id: updates.raw_id || null,
        mre_no: updates.mre_no || null,
      })
      .eq('vin', vin)
      .select(`
        vin,
        build_date,
        via_no,
        raw_id,
        mre_no,
        created_at,
        updated_at,
        raw_workshops ( name ),
        model_reports ( make, model )
      `)
      .single();

    if (error) throw error;
    const row: any = data;
    return {
      vin: row.vin,
      build_date: row.build_date,
      via_no: row.via_no,
      raw_id: row.raw_id,
      raw_workshop_name: row.raw_workshops?.name || null,
      mre_no: row.mre_no,
      make: row.model_reports?.make || null,
      model: row.model_reports?.model || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async delete(vin: string): Promise<void> {
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('vin', vin);

    if (error) throw error;
  }
};

