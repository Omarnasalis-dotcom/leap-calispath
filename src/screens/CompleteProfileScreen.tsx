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

// Reached only when AuthGuard detects a signed-in user with no display_name —
// which today only happens after a first-time Google/Apple sign-in, since the
// email/password signup form always collects it up front. Gender and country
// are left skippable here (EditProfileModal already supports setting them
// later, once, and nothing in the assessment/scoring flow reads them), but
// display_name has no other entry point once this screen is passed.
export function CompleteProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const { safeMutate, isMutating } = useSafeMutation();

  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const filteredCountries = COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()));

  async function handleContinue() {
    const cleanDisplayName = displayName.trim();
    if (!cleanDisplayName) {
      Alert.alert('Missing Username', 'Please choose a username to continue.');
      return;
    }
    if (cleanDisplayName.includes('@')) {
      Alert.alert('Invalid Username', 'Your username cannot contain the @ symbol. Please choose a different username.');
      return;
    }

    await safeMutate(async () => {
      const { data: isAvailable, error: usernameError } = await supabase.rpc('check_username_available', {
        username: cleanDisplayName,
      });
      if (usernameError) return { error: usernameError };
      if (isAvailable === false) {
        return { error: new Error('This username is already taken. Please choose another one.') };
      }

      const updates: Record<string, string> = { display_name: cleanDisplayName };
      const cleanFirstName = firstName.trim();
      const cleanLastName = lastName.trim();
      if (cleanFirstName) updates.first_name = cleanFirstName;
      if (cleanLastName) updates.last_name = cleanLastName;
      if (gender) updates.gender = gender;
      if (country) updates.country = country;

      const { error } = await supabase.from('profiles').update(updates).eq('id', profile!.id);
      if (error) return { error };
      return { data: null, error: null };
    }, {
      onSuccess: () => refreshProfile(),
      errorMessage: 'Failed to save your profile. Please try again.',
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
            COMPLETE YOUR <Text style={{ color: theme.accent }}>PROFILE</Text>
          </Text>
          <Text style={[styles.subheading, { color: theme.text.secondary }]}>
            Choose a username to finish setting up your account.
          </Text>

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

          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { color: theme.text.primary, marginBottom: 8 }]}>Gender (optional)</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.genderButton,
                  { borderColor: theme.card.border, backgroundColor: gender === 'Male' ? theme.accent : theme.card.background },
                  gender === 'Male' && { borderColor: theme.accent }
                ]}
                onPress={() => setGender(gender === 'Male' ? null : 'Male')}
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
                onPress={() => setGender(gender === 'Female' ? null : 'Female')}
              >
                <Text style={[styles.genderText, { color: gender === 'Female' ? '#FFF' : theme.text.secondary }]}>FEMALE</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { color: theme.text.primary, marginBottom: 8 }]}>Country (optional)</Text>
            <TouchableOpacity
              style={[styles.countryButton, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}
              onPress={() => setIsCountryModalVisible(true)}
            >
              <Text style={[styles.countryText, { color: country ? theme.text.primary : theme.text.secondary }]}>
                {country || 'Select your country'}
              </Text>
            </TouchableOpacity>
          </View>

          <Button title="CONTINUE" onPress={handleContinue} loading={isMutating} />
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
                <Text style={{ color: theme.text.secondary, fontWeight: '700' }}>CANCEL</Text>
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
