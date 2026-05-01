# Plus Jakarta Sans Font Setup

## Download Required Fonts

Download these fonts from Google Fonts and place them in `assets/fonts/`:

1. **Plus Jakarta Sans Regular**: https://fonts.google.com/specimen/Plus+Jakarta+Sans
   - Download: `PlusJakartaSans-Regular.ttf`

2. **Plus Jakarta Sans Bold**: 
   - Download: `PlusJakartaSans-Bold.ttf`

3. **Plus Jakarta Sans ExtraBold**:
   - Download: `PlusJakartaSans-ExtraBold.ttf`

## Installation Steps

1. Go to https://fonts.google.com/specimen/Plus+Jakarta+Sans
2. Click "Download family"
3. Extract the ZIP file
4. Copy these files to `assets/fonts/`:
   - `static/PlusJakartaSans-Regular.ttf`
   - `static/PlusJakartaSans-Bold.ttf` 
   - `static/PlusJakartaSans-ExtraBold.ttf`

5. Rename them to match the app.json configuration:
   - `PlusJakartaSans-Regular.ttf`
   - `PlusJakartaSans-Bold.ttf`
   - `PlusJakartaSans-ExtraBold.ttf`

## Usage

Once fonts are installed, use them in your components:

```typescript
import { useSpartanFonts } from '../hooks/useFonts';

// In your component
const fontsLoaded = useSpartanFonts();

if (!fontsLoaded) {
  return <LoadingSpinner />;
}

// Use in Text components
<Text style={{ fontFamily: 'PlusJakartaSans-Bold' }}>
  Spartan Text
</Text>
```
