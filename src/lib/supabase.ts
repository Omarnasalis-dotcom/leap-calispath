import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and ' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example) before starting the app.'
  );
}

// Web-compatible storage using localStorage
const WebStorageAdapter = {
  getItem: (key: string): Promise<string | null> => {
    try {
      const value = localStorage.getItem(key);
      return Promise.resolve(value);
    } catch {
      return Promise.resolve(null);
    }
  },
  setItem: (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
      return Promise.resolve();
    } catch {
      return Promise.resolve();
    }
  },
  removeItem: (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
      return Promise.resolve();
    } catch {
      return Promise.resolve();
    }
  },
};

// Native storage using SecureStore with chunking to bypass the 2048-byte limit per key
const CHUNK_SIZE = 2000;

const NativeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const chunksCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunksCountStr) {
        const count = parseInt(chunksCountStr, 10);
        if (!isNaN(count)) {
          const promises = [];
          for (let i = 0; i < count; i++) {
            promises.push(SecureStore.getItemAsync(`${key}_chunk_${i}`));
          }
          const chunks = await Promise.all(promises);
          if (chunks.some(chunk => chunk === null)) {
            return null;
          }
          return chunks.join('');
        }
      }
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.warn('[Supabase Storage] Error reading from SecureStore:', e);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // Always clean up existing keys and chunk indexes first to prevent stale state
      await NativeStorageAdapter.removeItem(key);

      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
      } else {
        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          chunks.push(value.substring(i, i + CHUNK_SIZE));
        }

        // Save chunks in parallel first
        await Promise.all(
          chunks.map((chunk, index) =>
            SecureStore.setItemAsync(`${key}_chunk_${index}`, chunk)
          )
        );

        // Save count last — this is the commit signal
        await SecureStore.setItemAsync(`${key}_chunks`, chunks.length.toString());
      }
    } catch (e) {
      console.error('[Supabase Storage] Error writing to SecureStore:', e);
      throw e;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const chunksCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunksCountStr) {
        const count = parseInt(chunksCountStr, 10);
        if (!isNaN(count)) {
          const promises = [];
          for (let i = 0; i < count; i++) {
            promises.push(SecureStore.deleteItemAsync(`${key}_chunk_${i}`));
          }
          promises.push(SecureStore.deleteItemAsync(`${key}_chunks`));
          await Promise.all(promises);
        }
      }
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.warn('[Supabase Storage] Error deleting from SecureStore:', e);
    }
  },
};

// Use web storage on web, native storage on iOS/Android
const isWeb = Platform.OS === 'web';
const storageAdapter = isWeb ? WebStorageAdapter : NativeStorageAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
