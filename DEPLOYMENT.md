# CalisPath Deployment Guide

## Quick Deploy to Vercel

### Option 1: Using Vercel CLI (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy from project root**
   ```bash
   cd "/Users/NewUser/Leap new gen2/leap-calispath"
   vercel --prod
   ```

### Option 2: Using Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Connect your GitHub repository or upload the folder
4. Vercel will automatically detect the Expo/React Native setup
5. Configure environment variables:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
6. Click "Deploy"

### Option 3: Manual Deploy to Any Static Host

1. **Build for production**
   ```bash
   npm run build:vercel
   ```

2. **Upload the `dist` folder** to any static hosting service:
   - Netlify
   - GitHub Pages
   - AWS S3 + CloudFront
   - Firebase Hosting

## Environment Variables

Make sure to set these in your hosting platform:
- `EXPO_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key

## What's Included

✅ PWA Manifest (installable as mobile app)
✅ Proper icons (192x192, 512x512)
✅ Optimized production build
✅ Static asset routing
✅ Cache headers for performance

## Post-Deployment Testing

After deployment, test:
1. PWA installation on mobile
2. Authentication flow
3. All screens load properly
4. Environment variables are working
5. Responsive design

## Custom Domain

Once deployed, you can add a custom domain in your hosting platform's dashboard.
