import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { useSpartanFonts } from './hooks/useFonts';
import { View, ActivityIndicator } from 'react-native';
import { SpartanLayout } from './app/_layout';
import Index from './app/index';

function AppContent() {
  const fontsLoaded = useSpartanFonts();

  if (!fontsLoaded) {
    return (
      <SpartanLayout>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#CD7F32" />
        </View>
      </SpartanLayout>
    );
  }

  return <Index />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}
