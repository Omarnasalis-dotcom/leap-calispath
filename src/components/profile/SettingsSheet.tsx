import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { DeleteAccountModal } from './DeleteAccountModal';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const { theme, mode, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const isDark = mode === 'dark';
  const [isMuted, setIsMuted] = useState(SoundService.getMuted());

  const handleSignOut = async () => {
    try {
      onClose();
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: theme.background.primary }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.text.tertiary }]}>SETTINGS</Text>

          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.card.border }]}
            onPress={() => {
              const next = !isMuted;
              setIsMuted(next);
              SoundService.setMuted(next);
            }}
          >
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name={isMuted ? 'volume-off' : 'volume-high'} size={18} color={theme.text.secondary} />
              <Text style={[styles.rowText, { color: theme.text.primary }]}>Arena Sounds</Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.text.tertiary }]}>{isMuted ? 'MUTED' : 'ON'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.card.border }]} onPress={toggleTheme}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="theme-light-dark" size={18} color={theme.text.secondary} />
              <Text style={[styles.rowText, { color: theme.text.primary }]}>Dark Mode</Text>
            </View>
            <MaterialCommunityIcons
              name={isDark ? 'toggle-switch' : 'toggle-switch-off'}
              size={26}
              color={isDark ? theme.accent : theme.text.tertiary}
            />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.card.border }]} onPress={handleSignOut}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="logout" size={18} color={theme.text.secondary} />
              <Text style={[styles.rowText, { color: theme.text.primary }]}>Leave the Arena</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.deleteWrap}>
            <DeleteAccountModal />
          </View>

          <TouchableOpacity style={[styles.closeButton, { borderColor: theme.card.border }]} onPress={onClose}>
            <Text style={[styles.closeButtonText, { color: theme.text.secondary }]}>CLOSE</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-Medium',
  },
  rowValue: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  deleteWrap: {
    marginTop: 4,
  },
  closeButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
