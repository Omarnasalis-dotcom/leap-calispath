import { TextStyle } from 'react-native';
import { WORLD_FONTS } from '../../../../constants/worldKitTokens';

export type KitWeight = keyof typeof WORLD_FONTS;

/**
 * Oswald text style. Weight is selected by font family (not fontWeight —
 * Android ignores fontWeight on a custom family), and font padding is
 * dropped so the tall Oswald glyphs centre inside rings and chips.
 */
export function kt(weight: KitWeight, size: number, color: string, letterSpacing = 0, lineHeight?: number): TextStyle {
  return {
    fontFamily: WORLD_FONTS[weight],
    fontSize: size,
    color,
    letterSpacing,
    includeFontPadding: false,
    ...(lineHeight != null ? { lineHeight } : null),
  };
}
