import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';

interface InlineVideoPlayerProps {
  url: string;
  theme: any;
  onClose: () => void;
}

function getYouTubeVideoId(url: string): string {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : '';
}

// Loading the embed URL directly as a WebView `uri` source doesn't send a
// same-origin request, which YouTube rejects with error 153 ("video player
// configuration error"). Wrapping the iframe in an HTML document served via
// the `html` source works around that.
function buildEmbedHtml(videoId: string): string {
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&controls=1&modestbranding=1&rel=0`;
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>html,body{margin:0;padding:0;background:#000;overflow:hidden;}iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0;}</style>
  </head>
  <body>
    <iframe src="${embedUrl}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  </body>
</html>`;
}

export const InlineVideoPlayer: React.FC<InlineVideoPlayerProps> = ({ url, theme, onClose }) => {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;

  return (
    <LinearGradient
      colors={['#7E57C2', '#FF5252', '#FF7043']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.gradientBorder}
    >
      <View style={[styles.card, { backgroundColor: theme.card.background }]}>
        <View style={styles.header}>
          <Text style={[styles.label, { color: theme.text.primary }]}>EXERCISE DEMO</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: theme.text.secondary, fontSize: 12, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 0.5 }}>
              ✕ CLOSE
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.playerWrap}>
          <WebView
            source={{ html: buildEmbedHtml(videoId), baseUrl: 'https://leap-arena.com' }}
            style={styles.player}
            originWhitelist={['*']}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
          />
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradientBorder: {
    padding: 1.2,
    borderRadius: 12,
  },
  card: {
    borderRadius: 11,
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 12,
    letterSpacing: 1,
  },
  playerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  player: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
