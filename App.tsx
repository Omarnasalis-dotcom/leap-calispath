import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { useStealthFonts } from './hooks/useFonts';
import { View, ActivityIndicator } from 'react-native';
import { SpartanLayout } from './src/components/SpartanLayout';
import Index from './app/index';

function AppContent() {
  const fontsLoaded = useStealthFonts();

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
