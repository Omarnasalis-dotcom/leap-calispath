import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { SpartanIntro } from '../components/SpartanIntro';

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(false); // Disable intro for now
  const [fadeAnim] = useState(new Animated.Value(1)); // Start visible
  const { signUp, signIn } = useAuth();
  const { theme } = useTheme();

  function handleIntroComplete() {
    setShowIntro(false);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please fill in all fields to continue.');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert(
        'Invalid Email',
        'Please enter a valid email address to continue your journey.',
        [{ text: 'Try Again' }]
      );
      return;
    }

    // Password validation
    if (password.length < 6) {
      Alert.alert(
        'Password Too Short',
        'Password must be at least 6 characters long. Create a stronger password to protect your warrior account.',
        [{ text: 'Try Again' }]
      );
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        Alert.alert(
          'Warrior Registered',
          'Check your email to verify your account, then return to claim your rank.',
          [{ text: 'Ready', onPress: () => setIsSignUp(false) }]
        );
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      console.error('Error message:', error.message);
      
      // ALWAYS show an error message for any auth failure
      if (isSignUp) {
        // For sign up, check if it's a duplicate email
        const errorMsg = error.message?.toLowerCase() || '';
        console.log('Checking error message for duplicate:', errorMsg);
        
        // Check for duplicate email patterns
        const isDuplicate = errorMsg.includes('already registered') || 
                           errorMsg.includes('already in use') ||
                           errorMsg.includes('duplicate') ||
                           errorMsg.includes('user_already_exists') ||
                           errorMsg.includes('user already registered') ||
                           errorMsg.includes('email already registered') ||
                           errorMsg.includes('email already taken');
        
        console.log('Is duplicate email?', isDuplicate);
        
        if (isDuplicate) {
          console.log('Showing duplicate email alert');
          Alert.alert(
            'Email Already Taken',
            'Your email already taken',
            [
              { text: 'Try Again', style: 'cancel' },
              { text: 'Sign In', onPress: () => setIsSignUp(false) }
            ]
          );
        } else {
          // Show any other sign up error
          console.log('Showing general registration error');
          Alert.alert(
            'Registration Failed',
            error.message || 'Unable to create your warrior account. Try again.',
            [{ text: 'Try Again' }]
          );
        }
      } else {
        // For sign in, show appropriate error
        const signInError = error.message?.toLowerCase() || '';
        console.log('Checking sign in error:', signInError);
        
        // Check for invalid credentials patterns
        const isInvalidCredentials = signInError.includes('invalid login') || 
                                   signInError.includes('invalid_credentials') ||
                                   signInError.includes('invalid email or password') ||
                                   signInError.includes('invalid login credentials');
        
        console.log('Is invalid credentials?', isInvalidCredentials);
        
        if (isInvalidCredentials) {
          console.log('Showing access denied alert');
          Alert.alert(
            'Access Denied',
            'Invalid email or password. Check your credentials and try again.',
            [{ text: 'Try Again' }]
          );
        } else {
          console.log('Showing general sign in error');
          Alert.alert(
            'Gatekeeper Denied',
            error.message || 'Authentication failed. Try again, warrior.',
            [{ text: 'Try Again' }]
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View 
          style={[
            styles.content, 
            { opacity: fadeAnim }
          ]}
        >
          <Text style={[styles.title, { color: theme.text.primary }]}>
            {isSignUp ? 'JOIN THE AGOGE' : 'READY TO LEAP'}
          </Text>
          
          <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
            {isSignUp 
              ? 'Begin your journey to Spartan strength' 
              : 'Return to your training grounds'
            }
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.accent }]} />

          <Input
            label="Email"
            placeholder="warrior@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            id="email"
            name="email"
            autoComplete="email"
          />

          <Input
            label="Password"
            placeholder="Min 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            id="password"
            name="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />

          <Button
            title={isSignUp ? 'CLAIM YOUR DESTINY' : 'ENTER THE ARENA'}
            onPress={handleSubmit}
            loading={loading}
          />

          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            style={styles.switchButton}
          >
            <Text style={[styles.switchText, { color: theme.text.secondary }]}>
              {isSignUp 
                ? 'Already a warrior? Return to battle' 
                : 'Begin your journey, Sign-Up'
              }
            </Text>
          </TouchableOpacity>

          <Text style={[styles.footer, { color: theme.text.tertiary }]}>
            "The pain of discipline is temporary. The glory of achievement is eternal."
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 31,
    fontWeight: '900',
    color: '#CD7F32',
    letterSpacing: 4,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 24,
  },
  divider: {
    height: 1,
    width: 100,
    alignSelf: 'center',
    marginBottom: 32,
  },
  form: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.3)',
    borderRadius: 16,
    padding: 24,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#CD7F32',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 2,
  },
  switchButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 32,
    paddingHorizontal: 20,
  },
});
