import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ExerciseLibraryScreen } from './ExerciseLibraryScreen';
import { ProgramBuilderScreen } from './ProgramBuilderScreen';
import { MyClientsScreen } from './MyClientsScreen';
import { ProgressTrackingScreen } from './ProgressTrackingScreen';

type Tab = 'library' | 'builder' | 'assign' | 'progress';

interface Tab_Config {
  key: Tab;
  label: string;
  icon: string;
}

const TABS: Tab_Config[] = [
  { key: 'library',  label: 'EXERCISES',  icon: 'dumbbell' },
  { key: 'builder',  label: 'BUILDER',    icon: 'hammer-wrench' },
  { key: 'assign',   label: 'MY CLIENTS', icon: 'account-arrow-right' },
  { key: 'progress', label: 'PROGRESS',   icon: 'chart-line' },
];

interface CoachingHubScreenProps {
  onClose?: () => void;
}

export function CoachingHubScreen({ onClose }: CoachingHubScreenProps) {
  const router = useRouter();
  const { theme, mode } = useTheme();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [activeTemplateIdForBuilder, setActiveTemplateIdForBuilder] = useState<string | undefined>(undefined);

  const handleTabChange = (key: Tab) => {
    if (key !== 'builder') {
      setActiveTemplateIdForBuilder(undefined);
    }
    setActiveTab(key);
  };

  const isDark = mode === 'dark';
  const solidCardBg = isDark ? '#151515' : '#FFFFFF';
  const bronzeGold = '#C8A040';

  const isAdmin = profile?.is_admin === true;
  const isCoach = profile?.is_coach === true || isAdmin;
  const coachId = user?.id;

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'library':
        return (
          <ExerciseLibraryScreen
            isAdmin={isAdmin}
            isCoach={isCoach}
          />
        );
      case 'builder':
        return (
          <ProgramBuilderScreen
            coachId={coachId}
            templateId={activeTemplateIdForBuilder}
            onSave={() => {}}
            onClose={() => handleTabChange('library')}
          />
        );
      case 'assign':
        return (
          <MyClientsScreen
            coachId={profile?.id}
            isAdmin={isAdmin}
          />
        );
      case 'progress':
        return (
          <ProgressTrackingScreen
            coachId={coachId}
            isAdmin={isAdmin}
            onClose={() => handleTabChange('library')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* ─── HEADER ─── */}
      <View style={[styles.header, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}>
        <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={bronzeGold} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text.primary }]}>
            COACHING CENTER
          </Text>
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerAccentLine}
          />
        </View>

        <View style={{ width: 44 }} />
      </View>

      {/* ─── TAB BAR ─── */}
      <View style={[styles.tabBar, { backgroundColor: isDark ? '#0D0D0D' : '#F5F5F5', borderBottomColor: 'rgba(255,255,255,0.04)' }]}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabBtn}
              onPress={() => handleTabChange(tab.key)}
              activeOpacity={0.7}
            >
              {isActive ? (
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabActiveGrad}
                >
                  <MaterialCommunityIcons name={tab.icon as any} size={14} color="#FFF" />
                  <Text style={styles.tabLabelActive}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.tabInactive}>
                  <MaterialCommunityIcons name={tab.icon as any} size={14} color={theme.text.tertiary} />
                  <Text style={[styles.tabLabelInactive, { color: theme.text.tertiary }]}>{tab.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── CONTENT ─── */}
      <View style={styles.content}>
        {renderTab()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 3,
  },
  headerAccentLine: {
    height: 2,
    width: 60,
    borderRadius: 1,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
  },
  tabActiveGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  tabInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  tabLabelActive: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 9,
    letterSpacing: 1,
    color: '#FFF',
  },
  tabLabelInactive: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  content: {
    flex: 1,
  },
});
