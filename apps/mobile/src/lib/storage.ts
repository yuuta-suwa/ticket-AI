import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Auth tokens → Keychain/Keystore (SecureStore). SecureStore values are limited (~2KB on some platforms) so large values are chunked. */
const CHUNK = 1800;
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (!n) return SecureStore.getItemAsync(key);
    const parts: string[] = [];
    for (let i = 0; i < Number(n); i++) parts.push((await SecureStore.getItemAsync(`${key}.${i}`)) ?? '');
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await secureStorage.removeItem(key);
    if (value.length <= CHUNK) return SecureStore.setItemAsync(key, value);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(n));
  },
  async removeItem(key: string): Promise<void> {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (n) { for (let i = 0; i < Number(n); i++) await SecureStore.deleteItemAsync(`${key}.${i}`); await SecureStore.deleteItemAsync(`${key}.n`); }
    await SecureStore.deleteItemAsync(key);
  },
};

/** Non-sensitive cache & preferences only (NEVER tokens). */
export const cacheStore = {
  async get<T>(key: string): Promise<{ value: T; at: number } | null> {
    try { const raw = await AsyncStorage.getItem(`cache:${key}`); return raw ? (JSON.parse(raw) as { value: T; at: number }) : null; } catch { return null; }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try { await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({ value, at: Date.now() })); } catch { /* cache is best-effort */ }
  },
  async clearAll(): Promise<void> {
    try { const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('cache:') || k.startsWith('pref:')); await AsyncStorage.multiRemove(keys); } catch { /* ignore */ }
  },
};
export const prefs = {
  async get(key: string): Promise<string | null> { try { return await AsyncStorage.getItem(`pref:${key}`); } catch { return null; } },
  async set(key: string, v: string): Promise<void> { try { await AsyncStorage.setItem(`pref:${key}`, v); } catch { /* ignore */ } },
};
