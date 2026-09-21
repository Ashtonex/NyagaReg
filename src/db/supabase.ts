import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CONFIG_STORAGE_KEY = 'administrare_supabase_config_v1';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
}

let activeClient: SupabaseClient | null = null;

/**
 * Loads Supabase configuration from localStorage or Vite environment variables.
 */
export function getSupabaseConfig(): SupabaseConfig {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.url && parsed.anonKey) {
        return {
          url: parsed.url.trim(),
          anonKey: parsed.anonKey.trim(),
          enabled: parsed.enabled ?? true
        };
      }
    }
  } catch {
    // Ignore storage read error
  }

  // Fallback to environment variables
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  return {
    url: envUrl,
    anonKey: envKey,
    enabled: Boolean(envUrl && envKey)
  };
}

/**
 * Saves Supabase credentials to localStorage and refreshes the active client.
 */
export function saveSupabaseConfig(url: string, anonKey: string, enabled = true): boolean {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();

  if (!cleanUrl || !cleanKey) return false;

  localStorage.setItem(
    CONFIG_STORAGE_KEY,
    JSON.stringify({ url: cleanUrl, anonKey: cleanKey, enabled })
  );

  // Reset active client so next call creates with new credentials
  activeClient = null;
  return true;
}

/**
 * Clears saved Supabase credentials and disconnects the active client.
 */
export function clearSupabaseConfig(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  activeClient = null;
}

/**
 * Gets or creates the active Supabase client singleton.
 * Returns null if Supabase is not configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (activeClient) return activeClient;

  const config = getSupabaseConfig();
  if (!config.enabled || !config.url || !config.anonKey) {
    return null;
  }

  try {
    activeClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    return activeClient;
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return null;
  }
}

/**
 * Tests the connection to Supabase and verifies table access.
 */
export async function testSupabaseConnection(
  testUrl?: string,
  testKey?: string
): Promise<{ success: boolean; message: string; tableCount?: number }> {
  const url = (testUrl || getSupabaseConfig().url).trim().replace(/\/+$/, '');
  const key = (testKey || getSupabaseConfig().anonKey).trim();

  if (!url || !key) {
    return { success: false, message: 'Please provide both Supabase Project URL and Anon API Key.' };
  }

  try {
    const testClient = createClient(url, key, {
      auth: { persistSession: false }
    });

    // Test query on attendees table
    const { count, error } = await testClient
      .from('attendees')
      .select('id', { count: 'exact', head: true });

    if (error) {
      if (error.code === '42P01' || error.message.includes('relation "attendees" does not exist')) {
        return {
          success: true,
          message: 'Connected to Supabase! (Note: Tables are not created yet. Please run the SQL schema script in Supabase SQL Editor).'
        };
      }
      return { success: false, message: `Database error: ${error.message} (Code: ${error.code || 'UNKNOWN'})` };
    }

    return {
      success: true,
      message: `Successfully connected to Supabase! Found ${count ?? 0} attendee records.`,
      tableCount: count ?? 0
    };
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err.message || err}` };
  }
}
