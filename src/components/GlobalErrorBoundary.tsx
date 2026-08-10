import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <MaterialCommunityIcons name="alert-circle-outline" size={80} color="#EF4444" />
          <Text style={styles.title}>SYSTEM FAILURE</Text>
          <Text style={styles.subtitle}>The interface has encountered a critical anomaly.</Text>
          <Text style={styles.errorText} numberOfLines={3}>
            {this.state.error?.message || 'Unknown error'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>REBOOT INTERFACE</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { color: '#EF4444', fontSize: 24, fontWeight: '900', marginTop: 24, letterSpacing: 2 },
  subtitle: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 12, marginBottom: 24 },
  errorText: { color: '#4B5563', fontSize: 10, fontFamily: 'monospace', textAlign: 'center', marginBottom: 40 },
  button: { backgroundColor: '#C8A040', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  buttonText: { color: '#000000', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});
