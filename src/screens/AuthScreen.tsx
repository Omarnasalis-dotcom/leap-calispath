import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
  SafeAreaView,
  FlatList,
  Linking,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { supabase } from '../lib/supabase';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { COUNTRIES } from '../constants/countries';

// Flip to true to require an invite code at signup again. The
// reserve/redeem/release RPC flow further down is untouched either
// way — this only controls whether providing a code is mandatory
// before submitting. A code is still honored (grants its trial/
// membership window) whenever one is entered, required or not.
const INVITE_CODE_REQUIRED = false;

export function AuthScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetModalVisible, setIsResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const { signUp, signIn } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();

  const filteredCountries = COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()));

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  function startResendCooldown() {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleResetPassword() {
    if (!resetEmail) {
      const msg = 'Please enter your email to reset your password.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Missing Field', msg);
      return;
    }
    
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: 'https://leap-arena.com/reset-password'
      });
      
      if (error) throw error;
      
      setResetSent(true);
      startResendCooldown();
    } catch (error: any) {
      const message = error.message || 'An unexpected error occurred.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Arena Error', message);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSubmit() {
    if (!email || !password || (isSignUp && (!firstName || !lastName || !displayName || !gender || !country || (INVITE_CODE_REQUIRED && !inviteCode)))) {
      Alert.alert('Missing Fields', `Please fill in all fields (including Username, Gender, and Country${INVITE_CODE_REQUIRED ? ', and Invite Code' : ''}) to continue.`);
      return;
    }

    if (isSignUp && displayName.includes('@')) {
      Alert.alert('Invalid Username', 'Your username cannot contain the @ symbol. Please choose a different username.');
      return;
    }

    setLoading(true);
    let inviteCodeReserved = false;
    const trimmedCode = inviteCode.trim();
    try {
      if (isSignUp) {
        // 1. Atomically reserve the invite code (if one was provided) to
        // prevent race conditions — codes are optional (INVITE_CODE_REQUIRED),
        // but still honored, and still grant their trial/membership window,
        // whenever someone enters one.
        if (trimmedCode) {
          const { data: reserveData, error: reserveError } = await supabase.rpc('reserve_invite_code', {
            p_code: trimmedCode
          });

          if (reserveError) {
            console.error('Reserve RPC Error:', reserveError);
            throw new Error(`Database Error: ${reserveError.message}`);
          }

          if (!reserveData || reserveData.success === false) {
            throw new Error(`Reservation Failed: ${reserveData?.error || 'Unknown error'}`);
          }
          inviteCodeReserved = true;
        }

        // 2. Check if username is already taken
        const { data: isAvailable, error: usernameError } = await supabase.rpc('check_username_available', {
          username: displayName.trim()
        });

        if (usernameError) {
          console.error('Username Check Error:', usernameError);
        } else if (isAvailable === false) {
          throw new Error('This username is already taken. Please choose another one.');
        }

        // 3. Create the User
        await signUp(email, password, { firstName, lastName, gender: gender!, country, displayName });

        // 4. Redeem and finalize the reserved code, if one was provided
        if (trimmedCode) {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id) {
            const { data: redeemData, error: redeemError } = await supabase.rpc('redeem_invite_code', {
              p_code: trimmedCode,
              p_user_id: authData.user.id
            });

            if (redeemError || !redeemData || redeemData.success === false) {
              console.error('Redeem Error:', redeemError || redeemData.error);
              const msg = 'Failed to finalize invite code redemption. Please contact support.';
              if (Platform.OS === 'web') window.alert(msg);
              else Alert.alert('Arena Error', msg);
              setLoading(false);
              return;
            }

            inviteCodeReserved = false; // Successfully redeemed, no need to release
          }
        }

        const msg = 'Welcome to the Arena! You can now sign in.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Warrior Registered', msg);
        setIsSignUp(false);
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      if (isSignUp) {
        setDisplayName(''); // Clear the display name on failure to prevent auth state leaks

        // If signup failed but we reserved a code, release it back to the pool
        if (inviteCodeReserved) {
          await supabase.rpc('release_invite_code', { p_code: trimmedCode });
        }
      }
      const message = error.message || 'An unexpected error occurred.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Arena Error', message);
      }
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
        <View style={[isSidebar ? styles.brandAccentVertical : styles.brandAccentHorizontal, { backgroundColor: theme.accent }]} />
        <View style={isSidebar ? styles.brandContentSidebar : styles.brandContentHeader}>
          <Text style={[
            styles.brandName, 
            { color: theme.text.primary }, 
            isSidebar ? { textAlign: 'left' } : { textAlign: 'center', fontSize: 36, lineHeight: 40 }
          ]}>
            LEAP{isSidebar ? '\n' : ' '}<Text style={{ color: theme.accent }}>ARENA</Text>
          </Text>
          <Text style={[styles.brandEyebrow, { color: theme.accent }, isSidebar && { textAlign: 'left' }]}>CALISTHENICS</Text>
          
          <View style={isSidebar ? styles.pillarsSidebar : styles.pillarsHeader}>
            {['Track', 'Compete', 'Train'].map((p: string, i: number) => (
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
    <GlobalErrorBoundary>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.card.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.card.background }]}
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
                style={[
                  styles.tab, 
                  !isSignUp && { borderBottomColor: theme.accent, backgroundColor: theme.card.border }
                ]} 
                onPress={() => setIsSignUp(false)}
              >
                <Text style={[styles.tabText, !isSignUp && { color: theme.accent }]}>ENTER THE ARENA</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.tab, 
                  isSignUp && { borderBottomColor: theme.accent, backgroundColor: theme.card.border }
                ]} 
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
                <>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Input label="First Name" placeholder="Alex" value={firstName} onChangeText={setFirstName} />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Input label="Last Name" placeholder="Warrior" value={lastName} onChangeText={setLastName} />
                    </View>
                  </View>
                  <Input 
                    label="Username" 
                    placeholder="alex_warrior" 
                    value={displayName} 
                    onChangeText={setDisplayName} 
                    autoCapitalize="none"
                  />
                </>
              )}

              {isSignUp && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.label, { color: theme.text.primary, marginBottom: 8 }]}>Gender</Text>
                  <View style={styles.row}>
                    <TouchableOpacity 
                      style={[
                        styles.genderButton, 
                        { borderColor: theme.card.border, backgroundColor: gender === 'Male' ? theme.accent : theme.card.background },
                        gender === 'Male' && { borderColor: theme.accent }
                      ]}
                      onPress={() => setGender('Male')}
                    >
                      <Text style={[styles.genderText, { color: gender === 'Male' ? '#FFF' : theme.text.secondary }]}>MALE</Text>
                    </TouchableOpacity>
                    <View style={{ width: 12 }} />
                    <TouchableOpacity 
                      style={[
                        styles.genderButton, 
                        { borderColor: theme.card.border, backgroundColor: gender === 'Female' ? theme.accent : theme.card.background },
                        gender === 'Female' && { borderColor: theme.accent }
                      ]}
                      onPress={() => setGender('Female')}
                    >
                      <Text style={[styles.genderText, { color: gender === 'Female' ? '#FFF' : theme.text.secondary }]}>FEMALE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {isSignUp && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.label, { color: theme.text.primary, marginBottom: 8 }]}>Country</Text>
                  <TouchableOpacity 
                    style={[
                      styles.countryButton, 
                      { borderColor: theme.card.border, backgroundColor: theme.card.background }
                    ]}
                    onPress={() => setIsCountryModalVisible(true)}
                  >
                    <Text style={[styles.countryText, { color: country ? theme.text.primary : theme.text.secondary }]}>
                      {country || 'Select your country'}
                    </Text>
                  </TouchableOpacity>
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
              
              {isSignUp && (
                <View style={{ marginBottom: 16 }}>
                  <Input
                    label={INVITE_CODE_REQUIRED ? 'Invite Code' : 'Invite Code (Optional)'}
                    placeholder="LEAP-XXXXXXXX"
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    autoCapitalize="characters"
                  />
                  {INVITE_CODE_REQUIRED ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL('https://leap-arena.com/request')}
                      style={{ marginTop: 6, alignSelf: 'flex-start' }}
                    >
                      <Text style={{
                        color: theme.accent,
                        fontSize: 12,
                        fontWeight: '600',
                        textDecorationLine: 'underline'
                      }}>
                        Don't have an invite code? Request one here
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: theme.text.tertiary, fontSize: 12, marginTop: 6 }}>
                      Have one? Add it for trial/membership perks. Not required to join.
                    </Text>
                  )}
                </View>
              )}

              {!isSignUp && (
                <TouchableOpacity style={styles.forgotButton} onPress={() => setIsResetModalVisible(true)}>
                  <Text style={[styles.forgotText, { color: theme.text.tertiary }]}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              <Button 
                title={isSignUp ? 'CLAIM YOUR DESTINY' : 'ENTER THE ARENA'} 
                onPress={handleSubmit} 
                loading={loading}
              />

              {isSignUp && (
                <TouchableOpacity onPress={() => Linking.openURL('https://leap-arena.com/privacy')}>
                  <Text style={{
                    color: '#666',
                    fontSize: 11,
                    textAlign: 'center',
                    marginTop: 16,
                    letterSpacing: 0.5,
                  }}>
                    By signing up, you agree to our{' '}
                    <Text style={{ color: '#CD7F32', textDecorationLine: 'underline' }}>
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>
              )}

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

        {/* PASSWORD RESET MODAL */}
        <Modal
          visible={isResetModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => { setIsResetModalVisible(false); setResetSent(false); }}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.heading, { color: theme.text.primary, fontSize: 24, marginBottom: 16 }]}>
                RESET <Text style={{ color: theme.accent }}>PASSWORD</Text>
              </Text>

              {resetSent ? (
                <View style={{ alignItems: 'center' }}>
                  {/* Checkmark icon */}
                  <View style={[styles.resetSentIcon, { borderColor: theme.accent }]}>
                    <Text style={{ color: theme.accent, fontSize: 28 }}>✓</Text>
                  </View>

                  <Text style={[styles.resetSentTitle, { color: theme.text.primary }]}>
                    CHECK YOUR EMAIL
                  </Text>
                  <Text style={[styles.resetSentSubtext, { color: theme.text.secondary }]}>
                    We sent a password reset link to
                  </Text>
                  <Text style={[styles.resetSentEmail, { color: theme.accent }]}>
                    {resetEmail}
                  </Text>
                  <Text style={[styles.resetSentSubtext, { color: theme.text.tertiary, marginTop: 8 }]}>
                    If you don't see it, check your spam folder.
                  </Text>

                  {/* Resend button with cooldown */}
                  <TouchableOpacity
                    style={[
                      styles.resendButton,
                      { borderColor: resendCooldown > 0 ? theme.card.border : theme.accent },
                      resendCooldown > 0 && { opacity: 0.5 }
                    ]}
                    onPress={handleResetPassword}
                    disabled={resendCooldown > 0 || resetLoading}
                  >
                    <Text style={[
                      styles.resendButtonText,
                      { color: resendCooldown > 0 ? theme.text.tertiary : theme.accent }
                    ]}>
                      {resetLoading
                        ? 'SENDING...'
                        : resendCooldown > 0
                          ? `RESEND IN ${resendCooldown}S`
                          : 'RESEND EMAIL'}
                    </Text>
                  </TouchableOpacity>

                  {/* Use a different email */}
                  <TouchableOpacity
                    style={{ marginTop: 12, padding: 8 }}
                    onPress={() => setResetSent(false)}
                  >
                    <Text style={[styles.tabText, { color: theme.text.secondary }]}>
                      USE A DIFFERENT EMAIL
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={{ marginTop: 16, alignItems: 'center', padding: 8 }} 
                    onPress={() => { setIsResetModalVisible(false); setResetSent(false); setResetEmail(''); }}
                  >
                    <Text style={[styles.tabText, { color: theme.text.secondary }]}>CLOSE</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Input 
                    label="Email" 
                    placeholder="warrior@email.com" 
                    value={resetEmail} 
                    onChangeText={setResetEmail} 
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  
                  <View style={{ marginTop: 8 }}>
                    <Button 
                      title="SEND RESET LINK" 
                      onPress={handleResetPassword} 
                      loading={resetLoading}
                    />
                  </View>
                  
                  <TouchableOpacity 
                    style={{ marginTop: 16, alignItems: 'center', padding: 8 }} 
                    onPress={() => { setIsResetModalVisible(false); setResetEmail(''); }}
                  >
                    <Text style={[styles.tabText, { color: theme.text.secondary }]}>CANCEL</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* COUNTRY PICKER MODAL */}
        <Modal
          visible={isCountryModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsCountryModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
              <View style={[styles.countryModalContent, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.modalTitle, { color: theme.text.primary }]}>Select Country</Text>
                
                <Input 
                  label=""
                  placeholder="Search..." 
                  value={countrySearch} 
                  onChangeText={setCountrySearch} 
                />

                <FlatList
                  data={filteredCountries}
                  keyExtractor={item => item}
                  style={{ width: '100%', maxHeight: 300, marginTop: 12 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={[styles.countryItem, { borderBottomColor: theme.card.border }]}
                      onPress={() => {
                        setCountry(item);
                        setIsCountryModalVisible(false);
                        setCountrySearch('');
                      }}
                    >
                      <Text style={{ color: theme.text.primary, fontSize: 16 }}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />

                <TouchableOpacity 
                  style={{ marginTop: 16, alignItems: 'center', padding: 8 }} 
                  onPress={() => setIsCountryModalVisible(false)}
                >
                  <Text style={[styles.tabText, { color: theme.text.secondary }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </ScrollView>
    </KeyboardAvoidingView>
      </SafeAreaView>
    </GlobalErrorBoundary>
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
    paddingTop: 16,
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
  },
  brandAccentHorizontal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  brandEyebrow: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 14,
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  brandName: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 42,
    color: '#FFFFFF',
    lineHeight: 46,
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
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  countryModalContent: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 24,
    textAlign: 'center',
  },
  countryButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  countryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  countryItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  genderButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  genderText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 16,
  },
  resetSentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  resetSentTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  resetSentSubtext: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  resetSentEmail: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  resendButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  resendButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 1.5,
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
