import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY = 'musicone_client_id';
let cached: string | null = null;

export async function getClientId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY, id);
    cached = id;
    return id;
  } catch {
    return 'legacy';
  }
}
