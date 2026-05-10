import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

export function AuthScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp, signIn } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();

  async function handleSubmit() {
    if (!email || !password || (isSignUp && (!firstName || !lastName))) {
      Alert.alert('Missing Fields', 'Please fill in all fields to continue.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        Alert.alert('Warrior Registered', 'Check your email to verify your account.');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      Alert.alert('Auth Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  const renderBranding = (layout: 'sidebar' | 'header') => {
    const isSidebar = layout === 'sidebar';
    return (
      <View style={[
        isSidebar ? styles.brandSectionSidebar : styles.brandSectionHeader,
        { backgroundColor: theme.card.background }
      ]}>
        <View style={isSidebar ? styles.brandAccentVertical : styles.brandAccentHorizontal} />
        <View style={isSidebar ? styles.brandContentSidebar : styles.brandContentHeader}>
          <Text style={[styles.brandEyebrow, isSidebar && { textAlign: 'left' }]}>CALISTHENICS</Text>
          <Text style={[
            styles.brandName, 
            { color: theme.text.primary }, 
            isSidebar ? { textAlign: 'left' } : { textAlign: 'center', fontSize: 36, lineHeight: 32 }
          ]}>
            LEAP{isSidebar ? '\n' : ' '}<Text style={{ color: theme.accent }}>ARENA</Text>
          </Text>
          
          <View style={isSidebar ? styles.pillarsSidebar : styles.pillarsHeader}>
            {['Track', 'Compete', 'Train'].map((p, i) => (
              <View 
                key={p} 
                style={[
                  styles.pillar, 
                  !isSidebar && styles.pillarHeader
                ]}
              >
                <Text style={[styles.pillarLabel, { color: theme.text.tertiary }]}>
                  {p.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {isSidebar && (
          <Text style={[styles.quote, { color: theme.text.tertiary }]}>
            "The pain of discipline is temporary. The glory of achievement is eternal."
          </Text>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background.primary }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[
          styles.root, 
          isDesktop ? styles.rootDesktop : styles.rootMobile,
          { backgroundColor: theme.background.primary, borderColor: theme.card.border }
        ]}>
          
          {/* BRANDING SECTION */}
          {renderBranding(isDesktop ? 'sidebar' : 'header')}

          {/* MAIN AUTH SECTION */}
          <View style={[styles.mainSection, { backgroundColor: theme.card.background }]}>
            <View style={[styles.tabs, { borderBottomColor: theme.card.border }]}>
              <TouchableOpacity 
                style={[styles.tab, !isSignUp && styles.activeTab]} 
                onPress={() => setIsSignUp(false)}
              >
                <Text style={[styles.tabText, !isSignUp && { color: theme.accent }]}>ENTER THE ARENA</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tab, isSignUp && styles.activeTab]} 
                onPress={() => setIsSignUp(true)}
              >
                <Text style={[styles.tabText, isSignUp && { color: theme.accent }]}>JOIN THE ARENA</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panel}>
              <Text style={[styles.heading, { color: theme.text.primary }]}>
                {isSignUp ? 'CLAIM YOUR ' : 'WELCOME BACK, '}
                <Text style={{ color: theme.accent }}>{isSignUp ? 'DESTINY' : 'WARRIOR'}</Text>
              </Text>
              <Text style={[styles.subheading, { color: theme.text.secondary }]}>
                {isSignUp ? 'Begin your calisthenics journey' : 'Return to your training grounds'}
              </Text>

              {isSignUp && (
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Input label="First Name" placeholder="Alex" value={firstName} onChangeText={setFirstName} />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Input label="Last Name" placeholder="Warrior" value={lastName} onChangeText={setLastName} />
                  </View>
                </View>
              )}

              <Input 
                label="Email" 
                placeholder="warrior@email.com" 
                value={email} 
                onChangeText={setEmail} 
                keyboardType="email-address"
                autoCapitalize="none"
              />
              
              <Input 
                label="Password" 
                placeholder="Min 6 characters" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry 
              />

              {!isSignUp && (
                <TouchableOpacity style={styles.forgotButton}>
                  <Text style={[styles.forgotText, { color: theme.text.tertiary }]}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              <Button 
                title={isSignUp ? 'CLAIM YOUR DESTINY' : 'ENTER THE ARENA'} 
                onPress={handleSubmit} 
                loading={loading}
              />

              <TouchableOpacity style={styles.switchLink} onPress={() => setIsSignUp(!isSignUp)}>
                <Text style={[styles.switchText, { color: theme.text.tertiary }]}>
                  {isSignUp ? 'Already a warrior? ' : 'New here? '}
                  <Text style={{ color: theme.accent, fontWeight: '600' }}>
                    {isSignUp ? 'Return to battle →' : 'Begin your journey →'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* THEME TOGGLE */}
            <View style={[styles.themeToggleContainer, { borderTopColor: theme.card.border }]}>
              <Text style={[styles.themeLabel, { color: theme.text.tertiary }]}>{mode === 'light' ? 'LIGHT MODE' : 'DARK MODE'}</Text>
              <TouchableOpacity 
                style={[styles.toggle, { backgroundColor: theme.card.border }]} 
                onPress={toggleTheme}
              >
                <View style={[
                  styles.toggleThumb, 
                  { 
                    backgroundColor: mode === 'dark' ? theme.accent : '#FFF',
                    transform: [{ translateX: mode === 'dark' ? 16 : 0 }]
                  }
                ]} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  },
  root: {
    width: '100%',
    alignSelf: 'center',
    minHeight: '100%',
  },
  rootDesktop: {
    flexDirection: 'row',
  },
  rootMobile: {
    flexDirection: 'column',
    maxWidth: 480,
  },
  brandSectionSidebar: {
    width: 300,
    padding: 48,
    justifyContent: 'space-between',
    position: 'relative',
    borderRightWidth: 1,
    borderRightColor: '#E8E8E8',
  },
  brandSectionHeader: {
    paddingTop: 64,
    paddingBottom: 0,
    position: 'relative',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  brandContentSidebar: {
    alignItems: 'flex-start',
  },
  brandContentHeader: {
    alignItems: 'center',
  },
  brandAccentVertical: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#F45B00',
  },
  brandAccentHorizontal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#F45B00',
  },
  brandEyebrow: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 14,
    letterSpacing: 2.5,
    color: '#F45B00',
    marginBottom: 10,
  },
  brandName: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 42,
    color: '#FFFFFF',
    lineHeight: 38,
    marginBottom: 8,
  },
  brandTag: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 10,
    letterSpacing: 1.8,
    color: '#666666',
    marginBottom: 24,
  },
  pillarsSidebar: {
    gap: 16,
  },
  pillarsHeader: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    width: '100%',
  },
  pillar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pillarHeader: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  pillarNum: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    color: '#F45B00',
  },
  pillarLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#666',
  },
  quote: {
    fontSize: 10,
    color: '#444',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 40,
  },
  mainSection: {
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 18,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#F45B00',
    backgroundColor: 'rgba(244, 91, 0, 0.05)',
  },
  tabText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#AAA',
  },
  panel: {
    padding: 32,
  },
  heading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 28,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  subheading: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    marginBottom: 32,
  },
  row: {
    flexDirection: 'row',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 16,
  },
  forgotText: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  switchLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
  },
  themeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderTopWidth: 1,
    marginTop: 'auto',
  },
  themeLabel: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    flex: 1,
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    padding: 3,
  },
  toggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
