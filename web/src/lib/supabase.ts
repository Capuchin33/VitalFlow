import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env (see web/.env.example)"
  );
}

/** URL after following the password-reset email link (must be listed in Supabase → Redirect URLs). */
export function getAuthRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL || "/", window.location.origin).href;
}

export const supabase = createClient(url, anon, {
  auth: {
    detectSessionInUrl: true,
  },
});

export type HealthSampleRow = {
  id: string;
  user_id: string;
  metric_type: string;
  value: number;
  unit: string | null;
  recorded_at: string;
  created_at: string;
};

/** Full ECG waveform (Lead I, mV) — table `ecg_waveforms`. */
export type EcgWaveformRow = {
  id: string;
  user_id: string;
  hk_sample_uuid: string;
  recorded_at: string;
  sampling_frequency_hz: number | null;
  classification_code: number | null;
  voltages_mv: number[];
  created_at: string;
};
