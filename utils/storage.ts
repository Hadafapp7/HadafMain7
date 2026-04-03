import { Platform } from 'react-native';

// MMKV is not supported on web — use a localStorage shim there
let storage: {
  set: (key: string, value: string | number | boolean) => void;
  getString: (key: string) => string | undefined;
  getBoolean: (key: string) => boolean | undefined;
  delete: (key: string) => void;
};

if (Platform.OS === 'web') {
  storage = {
    set: (key, value) => localStorage.setItem(key, String(value)),
    getString: (key) => localStorage.getItem(key) ?? undefined,
    getBoolean: (key) => {
      const v = localStorage.getItem(key);
      return v === null ? undefined : v === 'true';
    },
    delete: (key) => localStorage.removeItem(key),
  };
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = new MMKV({ id: 'hadaf-storage' });
  storage = {
    set: (key, value) => mmkv.set(key, value as string),
    getString: (key) => mmkv.getString(key),
    getBoolean: (key) => mmkv.getBoolean(key),
    delete: (key) => mmkv.delete(key),
  };
}

export { storage };
