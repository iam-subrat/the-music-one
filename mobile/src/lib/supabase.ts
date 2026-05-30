import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

// Polyfill crypto.subtle.digest using expo-crypto so supabase-js can do SHA-256
// PKCE instead of falling back to insecure `plain`.
const g = globalThis as unknown as { crypto?: { subtle?: { digest?: unknown } } };
if (g.crypto && !g.crypto.subtle) {
  g.crypto.subtle = {
    digest: async (algorithm: string | { name: string }, data: ArrayBuffer | Uint8Array) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      const algoMap: Record<string, Crypto.CryptoDigestAlgorithm> = {
        'SHA-1':   Crypto.CryptoDigestAlgorithm.SHA1,
        'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256,
        'SHA-384': Crypto.CryptoDigestAlgorithm.SHA384,
        'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512,
      };
      const algo = algoMap[name];
      if (!algo) throw new Error(`Unsupported digest: ${name}`);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      const text = String.fromCharCode(...bytes);
      const hex = await Crypto.digestStringAsync(algo, text, {
        encoding: Crypto.CryptoEncoding.HEX,
      });
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
      return out.buffer;
    },
  } as never;
}

const supabaseUrl: string = Constants.expoConfig?.extra?.supabaseUrl ?? '';
const supabaseAnonKey: string = Constants.expoConfig?.extra?.supabaseAnonKey ?? '';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
