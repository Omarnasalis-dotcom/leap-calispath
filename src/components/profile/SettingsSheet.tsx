import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Purchases from 'react-native-purchases';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTutorial } from '../../contexts/TutorialContext';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { DeleteAccountModal } from './DeleteAccountModal';
import { t, FLIP_X, CAN_CHOOSE_ARABIC, currentLanguage, type AppLanguage } from '../../i18n';
import { setAppLanguage } from '../../i18n/language';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const { theme, mode, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const { start: startTutorial } = useTutorial();
  const isDark = mode === 'dark';
  const [isMuted, setIsMuted] = useState(SoundService.getMuted());

  const handleChooseLanguage = () => {
    const switchTo = (language: AppLanguage) => {
      if (language === currentLanguage) return;
      Alert.alert(t('settings.restartTitle'), t('settings.restartMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.restart'), onPress: () => setAppLanguage(language) },
      ]);
    };
    // Each language is always shown in its own script.
    Alert.alert(t('settings.chooseLanguage'), undefined, [
      { text: 'English', onPress: () => switchTo('en') },
      { text: 'العربية', onPress: () => switchTo('ar') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleReplayTutorial = () => {
    onClose();
    startTutorial();
  };

  const handleManageSubscription = async () => {
    // Apple/Google require subscription management (including cancellation)
    // to go through the platform's own UI — apps can't build a competing
    // in-app cancel flow. This opens that native sheet directly rather than
    // making the user hunt through iOS Settings themselves. Web has no
    // native subscription sheet to open.
    if (Platform.OS === 'web') return;
    try {
      await Purchases.showManageSubscriptions();
    } catch (error) {
      console.error('[Settings] showManageSubscriptions failed:', error);
      Alert.alert(t('settings.couldNotOpen'), t('settings.manageFromDevice'));
    }
  };

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
          <Text style={[styles.title, { color: theme.text.tertiary }]}>{t('settings.title')}</Text>

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
              <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('settings.sounds')}</Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.text.tertiary }]}>{isMuted ? t('settings.muted') : t('settings.on')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.card.border }]} onPress={toggleTheme}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name={isDark ? 'weather-night' : 'white-balance-sunny'} size={18} color={theme.text.secondary} />
              <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('settings.appearance')}</Text>
            </View>
            {/* The current mode, like the Sounds and Language rows; tap switches. */}
            <Text style={[styles.rowValue, { color: theme.text.tertiary }]}>{isDark ? t('settings.dark') : t('settings.light')}</Text>
          </TouchableOpacity>

          {CAN_CHOOSE_ARABIC && Platform.OS !== 'web' && (
            <TouchableOpacity style={[styles.row, { borderBottomColor: theme.card.border }]} onPress={handleChooseLanguage}>
              <View style={styles.rowLeft}>
                <MaterialCommunityIcons name="translate" size={18} color={theme.text.secondary} />
                <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('settings.language')}</Text>
              </View>
              <Text style={[styles.rowValue, { color: theme.text.tertiary }]}>{t('settings.languageName')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.card.border }]} onPress={handleReplayTutorial}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={theme.text.secondary} />
              <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('settings.replayTutorial')}</Text>
            </View>
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <TouchableOpacity style={[styles.row, { borderBottomColor: theme.card.border }]} onPress={handleManageSubscription}>
              <View style={styles.rowLeft}>
                <MaterialCommunityIcons name="credit-card-outline" size={18} color={theme.text.secondary} />
                <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('settings.manageSubscription')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text.tertiary} style={FLIP_X} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.card.border }]} onPress={handleSignOut}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="logout" size={18} color={theme.text.secondary} />
              <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('settings.signOut')}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.deleteWrap}>
            <DeleteAccountModal />
          </View>

          <TouchableOpacity style={[styles.closeButton, { borderColor: theme.card.border }]} onPress={onClose}>
            <Text style={[styles.closeButtonText, { color: theme.text.secondary }]}>{t('settings.close')}</Text>
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
