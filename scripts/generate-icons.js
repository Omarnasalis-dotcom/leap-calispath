#!/usr/bin/env node

/**
 * Script to generate PWA icons from a single source icon
 * Run with: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Icon sizes needed for PWA
const iconSizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 70, name: 'icon-70x70.png' },
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 150, name: 'icon-150x150.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 167, name: 'icon-167x167.png' },
  { size: 180, name: 'icon-180x180.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 310, name: 'icon-310x310.png' },
  { size: 310, name: 'icon-310x150.png' }, // Wide
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' },
];

console.log('🎨 PWA Icon Generation Script');
console.log('================================');
console.log('');
console.log('To generate all required PWA icons, you need:');
console.log('1. A source icon at least 512x512 pixels');
console.log('2. ImageMagick or Sharp installed');
console.log('');
console.log('Install dependencies:');
console.log('  npm install -g imagemagick');
console.log('  # OR');
console.log('  npm install sharp');
console.log('');
console.log('Place your source icon as: assets/icon-source.png');
console.log('Then run: node scripts/generate-icons.js');
console.log('');
console.log('Required icon sizes:');
iconSizes.forEach(({ size, name }) => {
  console.log(`  ${size}x${size} → ${name}`);
});

// Check if source icon exists
const sourceIcon = path.join(__dirname, '../assets/icon-source.png');
if (fs.existsSync(sourceIcon)) {
  console.log('');
  console.log('✅ Source icon found!');
  
  // Try to generate icons with ImageMagick
  try {
    const { execSync } = require('child_process');
    const assetsDir = path.join(__dirname, '../assets');
    
    iconSizes.forEach(({ size, name }) => {
      const outputPath = path.join(assetsDir, name);
      const command = `convert "${sourceIcon}" -resize ${size}x${size} "${outputPath}"`;
      
      try {
        execSync(command);
        console.log(`✅ Generated ${name}`);
      } catch (error) {
        console.log(`❌ Failed to generate ${name}: ${error.message}`);
      }
    });
    
    console.log('');
    console.log('🎉 Icon generation complete!');
  } catch (error) {
    console.log('❌ ImageMagick not found. Please install it:');
    console.log('   brew install imagemagick (macOS)');
    console.log('   sudo apt-get install imagemagick (Ubuntu)');
  }
} else {
  console.log('');
  console.log('❌ Source icon not found at assets/icon-source.png');
  console.log('   Please add a 512x512 PNG source icon');
}
