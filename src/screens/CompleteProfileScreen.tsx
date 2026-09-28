import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { COUNTRIES } from '../constants/countries';
import { useSafeMutation } from '../hooks/useSafeMutation';
import { track } from '../lib/analytics';
import { t } from '../i18n';

// Mirrors the database rule profiles_display_name_format (1-30 chars, no @).
const USERNAME_MAX_LENGTH = 30;
const USERNAME_TAKEN_MESSAGE = t('profileSetup.usernameTaken');
const USERNAME_RULES_MESSAGE = t('profileSetup.usernameRules', { max: USERNAME_MAX_LENGTH });
const SAVE_FAILED_MESSAGE = t('profileSetup.saveFailed');

// Reached only when AuthGuard detects a signed-in user with no display_name —
// which today only happens after a first-time Google/Apple sign-in, since the
// email/password signup form always collects it up front. Gender and country
// are left skippable here (EditProfileModal already supports setting them
// later, once, and nothing in the assessment/scoring flow reads them), but
// display_name has no other entry point once this screen is passed.
export function CompleteProfileScreen() {
  const { profile, refreshProfile, pendingAppleName } = useAuth();
  const { theme } = useTheme();
  const { safeMutate, isMutating } = useSafeMutation();

  // pendingAppleName is captured synchronously from Apple's credential and
  // can't be stale the way profile.first_name/last_name can (that round-trips
  // through the database and races the auth listener's own profile fetch —
  // see AuthContext.signInWithApple). Prefer it whenever present; fall back to
  // profile for a later render pass or for Google/email, neither of which set
  // pendingAppleName at all.
  const initialFirstName = pendingAppleName?.firstName || profile?.first_name || '';
  const initialLastName = pendingAppleName?.lastName || profile?.last_name || '';

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const filteredCountries = COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()));

  // Sign in with Apple already supplies first/last name on first authorization
  // — showing these as fields to fill in again violates App Review Guideline
  // 4's Sign in with Apple requirements. Google/email signups never populate
  // either source, so they still correctly see the fields.
  const needsName = !initialFirstName && !initialLastName;

  // Analytics (audit M18): 16% of new signups stalled on this screen with no
  // way to see why — record views and every reason a save is rejected.
  useEffect(() => {
    track('complete_profile_viewed');
  }, []);

  async function handleContinue() {
    const cleanDisplayName = displayName.trim();
    if (!cleanDisplayName) {
      track('complete_profile_error', { reason: 'missing_username' });
      Alert.alert(t('profileSetup.missingUsernameTitle'), t('profileSetup.missingUsername'));
      return;
    }
    if (cleanDisplayName.includes('@')) {
      track('complete_profile_error', { reason: 'contains_at' });
      Alert.alert(t('profileSetup.invalidUsernameTitle'), t('profileSetup.usernameHasAt'));
      return;
    }

    await safeMutate(async () => {
      const { data: isAvailable, error: usernameError } = await supabase.rpc('check_username_available', {
        username: cleanDisplayName,
      });
      if (usernameError) {
        track('complete_profile_error', { reason: 'username_check_failed' });
        return { error: new Error(SAVE_FAILED_MESSAGE) };
      }
      if (isAvailable === false) {
        track('complete_profile_error', { reason: 'username_taken' });
        return { error: new Error(USERNAME_TAKEN_MESSAGE) };
      }

      const updates: Record<string, string> = { display_name: cleanDisplayName };
      const cleanFirstName = firstName.trim();
      const cleanLastName = lastName.trim();
      if (cleanFirstName) updates.first_name = cleanFirstName;
      if (cleanLastName) updates.last_name = cleanLastName;
      if (gender) updates.gender = gender;
      if (country) updates.country = country;

      const { error } = await supabase.from('profiles').update(updates).eq('id', profile!.id);
      if (error) {
        // The database enforces the username rules too (unique ignoring
        // case, 1-30 chars, no @), e.g. when two people pick the same name
        // at the same moment. Map those to something the user can act on.
        const reason = error.code === '23505' ? 'username_taken' : error.code === '23514' ? 'username_rules' : 'save_failed';
        track('complete_profile_error', { reason });
        if (reason === 'username_taken') return { error: new Error(USERNAME_TAKEN_MESSAGE) };
        if (reason === 'username_rules') return { error: new Error(USERNAME_RULES_MESSAGE) };
        return { error: new Error(SAVE_FAILED_MESSAGE) };
      }
      return { data: null, error: null };
    }, {
      // No errorMessage override: it replaced every message above with the
      // generic one, so "username taken" was never actually shown.
      onSuccess: () => refreshProfile(),
    });
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.card.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.panel}>
          <Text style={[styles.heading, { color: theme.text.primary }]}>
            {t('profileSetup.headingLead')}<Text style={{ color: theme.accent }}>{t('profileSetup.headingAccent')}</Text>
          </Text>
          <Text style={[styles.subheading, { color: theme.text.secondary }]}>
            {t('profileSetup.subheading')}
          </Text>

          {needsName && (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input label={t('profileSetup.firstName')} placeholder={t('profileSetup.firstNamePlaceholder')} value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Input label={t('profileSetup.lastName')} placeholder={t('profileSetup.lastNamePlaceholder')} value={lastName} onChangeText={setLastName} />
              </View>
            </View>
          )}

          <Input
            label={t('profileSetup.username')}
            placeholder={t('profileSetup.usernamePlaceholder')}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="none"
            maxLength={USERNAME_MAX_LENGTH}
          />

          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { color: theme.text.primary, marginBottom: 8 }]}>{t('profileSetup.genderOptional')}</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.genderButton,
                  { borderColor: theme.card.border, backgroundColor: gender === 'Male' ? theme.accent : theme.card.background },
                  gender === 'Male' && { borderColor: theme.accent }
                ]}
                onPress={() => setGender(gender === 'Male' ? null : 'Male')}
              >
                <Text style={[styles.genderText, { color: gender === 'Male' ? '#FFF' : theme.text.secondary }]}>{t('profileSetup.male')}</Text>
              </TouchableOpacity>
              <View style={{ width: 12 }} />
              <TouchableOpacity
                style={[
                  styles.genderButton,
                  { borderColor: theme.card.border, backgroundColor: gender === 'Female' ? theme.accent : theme.card.background },
                  gender === 'Female' && { borderColor: theme.accent }
                ]}
                onPress={() => setGender(gender === 'Female' ? null : 'Female')}
              >
                <Text style={[styles.genderText, { color: gender === 'Female' ? '#FFF' : theme.text.secondary }]}>{t('profileSetup.female')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { color: theme.text.primary, marginBottom: 8 }]}>{t('profileSetup.countryOptional')}</Text>
            <TouchableOpacity
              style={[styles.countryButton, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}
              onPress={() => setIsCountryModalVisible(true)}
            >
              <Text style={[styles.countryText, { color: country ? theme.text.primary : theme.text.secondary }]}>
                {country || t('profileSetup.selectYourCountry')}
              </Text>
            </TouchableOpacity>
          </View>

          <Button title={t('profileSetup.continue')} onPress={handleContinue} loading={isMutating} />
        </View>
      </ScrollView>

      <Modal
        visible={isCountryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCountryModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
            <View style={[styles.countryModalContent, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>{t('profileSetup.selectCountry')}</Text>
              <Input
                label=""
                placeholder={t('profileSetup.search')}
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
                <Text style={{ color: theme.text.secondary, fontWeight: '700' }}>{t('profileSetup.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  panel: {
    padding: 32,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
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
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  countryItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
});
