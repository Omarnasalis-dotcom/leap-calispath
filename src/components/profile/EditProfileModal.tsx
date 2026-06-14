import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { COUNTRIES } from '../../constants/countries';
import { useSafeMutation } from '../../hooks/useSafeMutation';
import { LeapLogo } from '../LeapLogo';

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  profile: any;
  refreshProfile: () => void;
}

export function EditProfileModal({ visible, onClose, profile, refreshProfile }: EditProfileModalProps) {
  const { theme } = useTheme();

  const [editGender, setEditGender] = useState<string | null>(null);
  const [editCountry, setEditCountry] = useState('');
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const { safeMutate, isMutating } = useSafeMutation();

  const filteredCountries = COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()));

  useEffect(() => {
    if (visible && profile) {
      setEditGender(profile.gender || null);
      setEditCountry(profile.country || '');
      setEditFirstName(profile.first_name || '');
      setEditLastName(profile.last_name || '');
      setCountrySearch('');
      setShowCountryModal(false);
    }
  }, [visible, profile]);

  const saveProfileInfo = async () => {
    if (!profile?.id) return;
    
    const updates: any = {};
    if (!profile.gender && editGender) updates.gender = editGender;
    if (!profile.country && editCountry) updates.country = editCountry;
    
    const cleanFirstName = editFirstName.trim();
    if (cleanFirstName !== (profile.first_name || '')) {
      updates.first_name = cleanFirstName;
    }
    
    const cleanLastName = editLastName.trim();
    if (cleanLastName !== (profile.last_name || '')) {
      updates.last_name = cleanLastName;
    }
    
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    await safeMutate(async () => {
      const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
      if (error) return { error };
      return { data: null, error: null };
    }, {
      onSuccess: () => {
        if (refreshProfile) refreshProfile();
        onClose();
      },
      errorMessage: 'Failed to update profile'
    });
  };

  return (
    <>
      <Modal
        visible={visible && !showCountryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.card.border, padding: 24 }]}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>EDIT PROFILE</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>
 
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>USERNAME (READ-ONLY)</Text>
              <View style={[styles.readOnlyInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={{ color: '#0A84FF', fontWeight: 'bold' }}>@{profile?.display_name || '-'}</Text>
                <MaterialCommunityIcons name="lock-outline" size={14} color={theme.text.tertiary} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>FIRST NAME</Text>
                <TextInput
                  style={[styles.readOnlyInput, { color: theme.text.primary, borderColor: theme.card.border, paddingVertical: 12 }]}
                  placeholder="First Name"
                  placeholderTextColor={theme.text.tertiary}
                  value={editFirstName}
                  onChangeText={setEditFirstName}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>LAST NAME</Text>
                <TextInput
                  style={[styles.readOnlyInput, { color: theme.text.primary, borderColor: theme.card.border, paddingVertical: 12 }]}
                  placeholder="Last Name"
                  placeholderTextColor={theme.text.tertiary}
                  value={editLastName}
                  onChangeText={setEditLastName}
                />
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>GENDER</Text>
              {profile?.gender ? (
                <View style={[styles.readOnlyInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <Text style={{ color: theme.text.secondary }}>{profile.gender}</Text>
                  <MaterialCommunityIcons name="lock-outline" size={14} color={theme.text.tertiary} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity 
                    style={[styles.genderButton, editGender === 'Male' && { borderColor: theme.accent, backgroundColor: theme.accent + '20' }, { borderColor: theme.card.border }]}
                    onPress={() => setEditGender('Male')}
                  >
                    <Text style={{ color: editGender === 'Male' ? theme.accent : theme.text.secondary, fontWeight: '700' }}>MALE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.genderButton, editGender === 'Female' && { borderColor: theme.accent, backgroundColor: theme.accent + '20' }, { borderColor: theme.card.border }]}
                    onPress={() => setEditGender('Female')}
                  >
                    <Text style={{ color: editGender === 'Female' ? theme.accent : theme.text.secondary, fontWeight: '700' }}>FEMALE</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={{ marginBottom: 24 }}>
              <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>COUNTRY</Text>
              {profile?.country ? (
                <View style={[styles.readOnlyInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <Text style={{ color: theme.text.secondary }}>{profile.country}</Text>
                  <MaterialCommunityIcons name="lock-outline" size={14} color={theme.text.tertiary} />
                </View>
              ) : (
                <TouchableOpacity 
                  style={[styles.readOnlyInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, justifyContent: 'center' }]}
                  onPress={() => setShowCountryModal(true)}
                >
                  <Text style={{ color: editCountry ? theme.text.primary : theme.text.tertiary }}>
                    {editCountry || 'Select Country'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={{ color: theme.text.tertiary, fontSize: 10, textAlign: 'center', marginBottom: 20, fontFamily: 'PlusJakartaSans-Bold', letterSpacing: 0.5, lineHeight: 14 }}>
              USERNAME, GENDER AND COUNTRY CAN ONLY BE SET ONCE. TO UPDATE LOCKED FIELDS, PLEASE CONTACT SUPPORT.
            </Text>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={saveProfileInfo}
              disabled={isMutating}
            >
              {isMutating ? (
                <LeapLogo size={24} animated />
              ) : (
                <Text style={styles.actionButtonText}>SAVE CHANGES</Text>
              )}
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* COUNTRY PICKER MODAL */}
      <Modal visible={showCountryModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.card.border, padding: 24, flex: 0.8 }]}>
            <Text style={[styles.modalTitle, { color: theme.text.primary, marginBottom: 16 }]}>Select Country</Text>
            <TextInput 
              placeholder="Search..."
              placeholderTextColor={theme.text.tertiary}
              style={{ color: theme.text.primary, borderWidth: 1, borderColor: theme.card.border, padding: 12, borderRadius: 8, marginBottom: 16 }}
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
            <FlatList
              data={filteredCountries}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.card.border }}
                  onPress={() => {
                    setEditCountry(item);
                    setShowCountryModal(false);
                    setCountrySearch('');
                  }}
                >
                  <Text style={{ color: theme.text.primary, fontSize: 16 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => setShowCountryModal(false)}>
              <Text style={{ color: theme.text.secondary, fontWeight: '700' }}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    borderWidth: 1,
    borderRadius: 24,
    width: '100%',
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 2,
    marginBottom: 8,
  },
  readOnlyInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  actionButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
});
