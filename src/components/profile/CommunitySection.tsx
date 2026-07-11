import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, StyleSheet, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeMutation } from '../../hooks/useSafeMutation';
import { LeapLogo } from '../LeapLogo';
import { getMyCommunity, createCommunity, joinCommunity, leaveCommunity, formatCommunityError, MyCommunity } from '../../lib/community';

interface CommunitySectionProps {
  userId: string;
}

export function CommunitySection({ userId }: CommunitySectionProps) {
  const { theme } = useTheme();
  // profile.community_id (AuthContext) is what every leaderboard's PUBLIC/
  // MY COMMUNITY toggle actually reads — refreshing only this component's
  // own local `community` state would update the status card here but
  // leave every other screen's toggle stale until the next full profile
  // reload. refreshProfile() propagates the new community_id everywhere
  // that reads useAuth() in one shot.
  const { refreshProfile } = useAuth();
  const [community, setCommunity] = useState<MyCommunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { safeMutate, isMutating } = useSafeMutation();

  const refresh = async () => {
    setLoading(true);
    const c = await getMyCommunity(userId);
    setCommunity(c);
    setLoading(false);
  };

  useEffect(() => {
    if (userId) refresh();
  }, [userId]);

  const handleCreate = async () => {
    setFormError(null);
    if (!createName.trim() || !createCode.trim()) {
      setFormError(formatCommunityError('NAME_AND_CODE_REQUIRED'));
      return;
    }
    await safeMutate(async () => {
      const result = await createCommunity(createName, createCode);
      if (!result.success) return { error: new Error(formatCommunityError(result.error)) };
      return { data: result, error: null };
    }, {
      onSuccess: async () => {
        setShowCreateModal(false);
        setCreateName('');
        setCreateCode('');
        await Promise.all([refresh(), refreshProfile?.()]);
      },
      onError: (err) => setFormError(err.message),
      // NAME_TAKEN/CODE_TAKEN are expected, already-handled validation
      // outcomes (shown inline via formError), not bugs — skip the
      // console.error that otherwise triggers a dev-mode redbox on-device.
      skipConsoleError: true,
    });
  };

  const handleJoin = async () => {
    setFormError(null);
    if (!joinCode.trim()) {
      setFormError('Enter a join code.');
      return;
    }
    await safeMutate(async () => {
      const result = await joinCommunity(joinCode);
      if (!result.success) return { error: new Error(formatCommunityError(result.error)) };
      return { data: result, error: null };
    }, {
      onSuccess: async () => {
        setShowJoinModal(false);
        setJoinCode('');
        await Promise.all([refresh(), refreshProfile?.()]);
      },
      onError: (err) => setFormError(err.message),
      // CODE_NOT_FOUND is an expected, already-handled validation outcome
      // (shown inline via formError) — not a bug. A mistyped code is the
      // most common way through this path, so it shouldn't look like a
      // crash on-device.
      skipConsoleError: true,
    });
  };

  const handleLeave = async () => {
    await safeMutate(async () => {
      const result = await leaveCommunity();
      if (!result.success) return { error: new Error(formatCommunityError(result.error)) };
      return { data: result, error: null };
    }, {
      onSuccess: async () => {
        await Promise.all([refresh(), refreshProfile?.()]);
      },
    });
  };

  const confirmLeave = () => {
    const warning = `You'll lose access to ${community?.name || 'this community'}'s leaderboards until you rejoin with a code.`;
    if (Platform.OS === 'web') {
      if (window.confirm(warning)) handleLeave();
    } else {
      Alert.alert('LEAVE COMMUNITY?', warning, [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'LEAVE', style: 'destructive', onPress: handleLeave },
      ]);
    }
  };

  if (loading) return null;

  return (
    <View style={{ marginTop: 12 }}>
      {community ? (
        <View style={[styles.statusCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: theme.text.tertiary }]}>MY COMMUNITY</Text>
            <Text style={[styles.statusName, { color: theme.text.primary }]} numberOfLines={1}>
              {community.name.toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity onPress={confirmLeave} disabled={isMutating} style={styles.leaveBtn}>
            {isMutating ? <LeapLogo size={18} animated /> : (
              <Text style={{ color: '#FF6B6B', fontWeight: '900', fontSize: 11, letterSpacing: 1 }}>LEAVE</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}
            onPress={() => { setFormError(null); setShowCreateModal(true); }}
          >
            <MaterialCommunityIcons name="account-group-outline" size={16} color={theme.text.primary} />
            <Text style={[styles.actionBtnText, { color: theme.text.primary }]}>CREATE COMMUNITY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: theme.accent, backgroundColor: theme.accent + '15' }]}
            onPress={() => { setFormError(null); setShowJoinModal(true); }}
          >
            <MaterialCommunityIcons name="login" size={16} color={theme.accent} />
            <Text style={[styles.actionBtnText, { color: theme.accent }]}>JOIN COMMUNITY</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CREATE MODAL */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>CREATE COMMUNITY</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>COMMUNITY NAME</Text>
            <TextInput
              style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border }]}
              placeholder="e.g. Iron Warriors Gym"
              placeholderTextColor={theme.text.tertiary}
              value={createName}
              onChangeText={setCreateName}
              maxLength={40}
            />

            <Text style={[styles.inputLabel, { color: theme.text.tertiary, marginTop: 16 }]}>JOIN CODE</Text>
            <TextInput
              style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border }]}
              placeholder="e.g. IRON2026"
              placeholderTextColor={theme.text.tertiary}
              value={createCode}
              onChangeText={setCreateCode}
              autoCapitalize="characters"
              maxLength={20}
            />
            <Text style={[styles.hint, { color: theme.text.tertiary }]}>
              Share this code with people you want to join. It can't be changed later.
            </Text>

            {formError && <Text style={styles.errorText}>{formError.toUpperCase()}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: theme.accent }]}
              onPress={handleCreate}
              disabled={isMutating}
            >
              {isMutating ? <LeapLogo size={24} animated /> : (
                <Text style={styles.submitBtnText}>CREATE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* JOIN MODAL */}
      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>JOIN COMMUNITY</Text>
              <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>JOIN CODE</Text>
            <TextInput
              style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border }]}
              placeholder="Enter the code you were given"
              placeholderTextColor={theme.text.tertiary}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              maxLength={20}
            />

            {formError && <Text style={styles.errorText}>{formError.toUpperCase()}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: theme.accent }]}
              onPress={handleJoin}
              disabled={isMutating}
            >
              {isMutating ? <LeapLogo size={24} animated /> : (
                <Text style={styles.submitBtnText}>JOIN</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  statusName: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 0.5,
  },
  leaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1,
  },
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
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
  },
  hint: {
    fontSize: 11,
    marginTop: 8,
    lineHeight: 15,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
});
