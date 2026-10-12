import { RefObject } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export type ShareCardResult = 'shared' | 'unavailable' | 'failed';

/**
 * Captures a card view as a PNG and opens the share sheet. Native captures
 * `ref`; web renders the DOM node with `webElementId` (the view's nativeID)
 * through html2canvas, then uses the Web Share API or downloads the file.
 * Callers show their own alert for 'unavailable' / 'failed'.
 */
export async function shareCardImage(ref: RefObject<View | null>, webElementId: string, fileName: string): Promise<ShareCardResult> {
  if (Platform.OS === 'web') {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const element = document.getElementById(webElementId);
      if (!element) return 'failed';
      const dataUrl = (await html2canvas(element, { backgroundColor: null, scale: 2 })).toDataURL('image/png');
      const nav = navigator as Navigator & { share?: (data: { files: File[]; title: string }) => Promise<void> };
      if (nav.share) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          await nav.share({ files: [new File([blob], fileName, { type: 'image/png' })], title: 'LEAP ARENA' });
          return 'shared';
        } catch { /* cancelled or unsupported: fall back to a download */ }
      }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      a.click();
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  try {
    const uri = await captureRef(ref, { format: 'png', quality: 0.9 });
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    await Sharing.shareAsync(uri);
    return 'shared';
  } catch {
    return 'failed';
  }
}
