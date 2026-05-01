import React from 'react';
import { View, TextInput, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface InputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  id?: string;
  name?: string;
  autoComplete?: 'email' | 'current-password' | 'new-password' | 'name' | 'username' | 'off';
}

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize,
  error,
  id,
  name,
  autoComplete,
}: InputProps) {
  const { theme } = useTheme();
  // Default autoCapitalize based on keyboardType if not specified
  const autoCap = autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences');
  
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text.secondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input, 
          { 
            backgroundColor: theme.card.background,
            borderColor: theme.card.border,
            color: theme.text.primary,
          },
          error && styles.inputError
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text.tertiary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCap}
        nativeID={id}
        {...(Platform.OS === 'web' && {
          id: id || name,
          name: name || id,
          autoComplete: autoComplete
        })}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.3)',
    borderRadius: 8,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  inputError: {
    borderColor: '#8B0000',
  },
  error: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 4,
  },
});
