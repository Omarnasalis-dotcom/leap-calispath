const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStore[k];
  }),
}));
jest.mock('expo', () => ({ reloadAppAsync: jest.fn(async () => {}) }));
let mockPhoneLanguage = 'ar';
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: mockPhoneLanguage }] }));

import { I18nManager } from 'react-native';
import { reloadAppAsync } from 'expo';
import { syncLanguageDirection, setAppLanguage, getPreferredLanguage } from '../language';

const setRTL = (rtl: boolean) => Object.defineProperty(I18nManager, 'isRTL', { value: rtl, configurable: true });

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
  jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
  jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
  setRTL(false);
  mockPhoneLanguage = 'ar';
});

it('follows the phone language when nothing is saved', async () => {
  expect(await getPreferredLanguage()).toBe('ar');
  mockPhoneLanguage = 'en';
  expect(await getPreferredLanguage()).toBe('en');
});

it('a saved choice wins over the phone language', async () => {
  await setAppLanguage('en');
  expect(await getPreferredLanguage()).toBe('en');
});

it('does nothing but keep left-to-right when English already matches', async () => {
  mockPhoneLanguage = 'en';
  await syncLanguageDirection();
  expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  expect(reloadAppAsync).not.toHaveBeenCalled();
});

it('an Arabic phone switches to right-to-left on first start, restarting once', async () => {
  await syncLanguageDirection();
  expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
});

it('restarts once to leave a right-to-left layout in English (Android on an Arabic phone)', async () => {
  mockPhoneLanguage = 'en';
  setRTL(true);
  await syncLanguageDirection();
  expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  // If the platform ignored it, the next start must not restart again.
  await syncLanguageDirection();
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
});

it('choosing Arabic saves it, turns on right-to-left and restarts', async () => {
  await setAppLanguage('ar');
  expect(await getPreferredLanguage()).toBe('ar');
  expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
});
