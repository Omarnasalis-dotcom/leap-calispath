import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface AssessmentGateScreenProps {
  onStartAssessment: () => void;
}

export function AssessmentGateScreen({ onStartAssessment }: AssessmentGateScreenProps) {
  const { theme } = useTheme();

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background.primary }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.content}>
        {/* Geometric Header */}
        <View style={styles.headerSection}>
          <View style={[styles.geometricIcon, { backgroundColor: theme.accent }]}>
            <Text style={styles.iconText}>◉</Text>
          </View>
          <Text style={[styles.title, { color: theme.text.primary }]}>THE AGOGE AWAITS</Text>
          <View style={[styles.underline, { backgroundColor: theme.accent }]} />
        </View>

        {/* Geometric Card */}
        <View style={[styles.card, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.headerDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.cardTitle, { color: theme.text.primary }]}>FOUR FUNDAMENTAL MOVEMENTS</Text>
          </View>
          
          <View style={styles.movements}>
            {['Push-ups', 'Pull-ups', 'Squats', 'Dips'].map((movement, index) => (
              <View key={index} style={[styles.movementItem, { backgroundColor: theme.background.secondary, borderColor: theme.card.border }]}>
                <View style={[styles.checkDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.movementText, { color: theme.text.primary }]}>{movement}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.principle, { color: theme.text.secondary }]}>
            Maximum reps with perfect form.
          </Text>
        </View>

        {/* Geometric Button */}
        <TouchableOpacity
          onPress={onStartAssessment}
          style={[styles.button, { backgroundColor: theme.accent }]}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.buttonLabel}>BEGIN ASSESSMENT</Text>
            <View style={styles.arrow}>
              <Text style={styles.arrowText}>→</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: '100%',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  geometricIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  underline: {
    height: 3,
    width: 60,
    borderRadius: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 28,
    marginBottom: 32,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  poem: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  movementSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 12,
  },
  description: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  movements: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  movementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    width: '48%',
  },
  checkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 12,
  },
  movementText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  principle: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 20,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 12,
    marginTop: 7,
  },
  hint: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  button: {
    borderRadius: 8,
    marginBottom: 24,
    alignSelf: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  arrow: {
    marginLeft: 12,
  },
  arrowText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 12,
  },
  footer: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
});
