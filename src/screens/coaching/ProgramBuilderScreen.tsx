import { useRouter, useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Alert } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { ExercisePickerModal } from '../../components/coaching/ExercisePickerModal';
import { CopyBlockModal } from '../../components/coaching/CopyBlockModal';
import { BuilderDayCard } from '../../components/coaching/BuilderDayCard';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';
import { BuilderMasterSelector } from '../../components/coaching/BuilderMasterSelector';
import { BuilderHeader } from '../../components/coaching/BuilderHeader';
import { BuilderWeekNavigator } from '../../components/coaching/BuilderWeekNavigator';
import { styles } from './ProgramBuilderScreen.styles';
import { GlobalErrorBoundary } from '../../components/GlobalErrorBoundary';
import {
  ProgramBlock,
  ProgramDay,
  useProgramBuilder
} from '../../hooks/coaching/useProgramBuilder';

interface ProgramBuilderScreenProps {
  coachId?: string;
  templateId?: string; // Optional for edit mode
  weekNum?: string; // Optional specific week to edit
  onSave?: () => void;
  onClose?: () => void;
}

export function ProgramBuilderScreen({ coachId: propCoachId, templateId, weekNum, onSave, onClose }: ProgramBuilderScreenProps) {
  const { theme, mode } = useTheme();
  const solidCardBg = mode === 'dark' ? '#151515' : '#FFFFFF';
  const inactiveBorder = mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
  const bronzeGold = '#C8A040';

  const handleSaveSuccess = () => {
    if (onSave) onSave();
    if (onClose) onClose();
  };

  const { state, actions } = useProgramBuilder(templateId, propCoachId, weekNum, handleSaveSuccess);

  // Destructure state
  const {
    activeTemplateId, setActiveTemplateId,
    isCreatingNew, setIsCreatingNew,
    masterTemplates, setMasterTemplates,
    assignedTemplates, setAssignedTemplates,
    catalogLoading, setCatalogLoading,
    templateName, setTemplateName,
    templateDesc, setTemplateDesc,
    weeks, setWeeks,
    activeWeek, setActiveWeek,
    days, setDays,
    loading, setLoading,
    errorMsg, setErrorMsg,
    expandedDays, setExpandedDays,
    expandedBlocks, setExpandedBlocks,
    athleteLogs, setAthleteLogs,
    pickerModalVisible, setPickerModalVisible,
    selectedDayIdForAdd, setSelectedDayIdForAdd,
    selectedBlockIdForAdd, setSelectedBlockIdForAdd,
    exerciseLibrary, setExerciseLibrary,
    libraryLoading, setLibraryLoading,
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    useWeeklyStructure, setUseWeeklyStructure,
    copyModalVisible, setCopyModalVisible,
    sourceBlock, setSourceBlock,
    sourceDay, setSourceDay,
    copyView, setCopyView,
    otherTemplates, setOtherTemplates,
    selectedTemplateId, setSelectedTemplateId,
    targetBlocks, setTargetBlocks,
    successMessage, setSuccessMessage,
    filteredLibrary,
    exportingTemplateId,
    importingTemplate,
    coachId
  } = state;


  // Destructure actions
  const {
    loadMasterTemplates,
    handleDeleteTemplate,
    handleExportMasterTemplate,
    handleImportMasterTemplate,
    loadExistingTemplate,
    fetchExerciseLibrary,
    handleOpenPicker,
    handleAddExerciseToBlock,
    handleDeleteExerciseFromBlock,
    handleUpdateExerciseValue,
    handleUpdateBlockValue,
    handleAddBlockToDay,
    handleDeleteBlockFromDay,
    handleToggleWeeklyStructure,
    handleUpdateDayName,
    handleUpdateDayFocusTag,
    handleAddDay,
    handleDeleteDay,
    handleDeleteWeek,
    handleCopyDayToDay,
    handleOpenCopyDayModal,
    handleOpenCopyModal,
    handleCopyDay,
    handleDuplicateBlockToDay,
    fetchOtherTemplates,
    fetchTargetBlocksForTemplate,
    handleCopyTemplate,
    handleMoveDay,
    handleMoveBlockWithinDay,
    handleSaveTemplate,
    toggleDay,
    toggleBlock
  } = actions;

  const categories = ['all', 'push', 'pull', 'legs', 'core', 'skill'];


  return (
    <GlobalErrorBoundary>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { backgroundColor: theme.background.primary }]}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          {/* HEADER BAR */}
          <View style={{
            alignItems: 'center',
            paddingTop: Platform.OS === 'ios' ? 40 : 10,
            paddingBottom: 12,
          }}>
            <Text style={{
              fontFamily: 'BarlowCondensed-ExtraBold',
              fontSize: 30,
              letterSpacing: 4,
              color: theme.text.primary,
              textAlign: 'center'
            }}>
              P R O G R Ʌ M
            </Text>
            <Text style={{
              fontFamily: 'BarlowCondensed-Bold',
              fontSize: 16,
              letterSpacing: 8,
              color: bronzeGold,
              textAlign: 'center',
              marginTop: -4
            }}>
              BUILDER
            </Text>
          </View>

          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                // Mid-edit (or mid-create), back should return to the catalog
                // list first — same as tapping CATALOG — not exit the builder
                // entirely. Only exit once already at the catalog level.
                if (activeTemplateId || isCreatingNew) {
                  setActiveTemplateId(undefined);
                  setIsCreatingNew(false);
                  loadMasterTemplates();
                } else if (onClose) {
                  onClose();
                }
              }}
              style={styles.closeButton}
            >
              <Text style={[styles.closeButtonText, { color: theme.text.secondary }]}>← BACK</Text>
            </TouchableOpacity>

            {(activeTemplateId || isCreatingNew) && (
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ padding: 1.2, borderRadius: 13 }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setActiveTemplateId(undefined);
                    setIsCreatingNew(false);
                    loadMasterTemplates();
                  }}
                  style={{
                    backgroundColor: solidCardBg,
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    height: 24,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <Text style={{
                    fontFamily: 'BarlowCondensed-ExtraBold',
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: bronzeGold
                  }}>
                    CATALOG
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            )}
            
          </View>

          {/* Glowing 3-World Separator line under header */}
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 1.5, width: '100%', marginBottom: 20 }}
          />

          {loading ? (
            <View style={styles.centerContainer}>
              <LeapLogo size={40} animated />
              <Text style={[styles.loadingText, { color: theme.text.secondary }]}>PROCESSING TEMPLATE DATA...</Text>
            </View>
          ) : !activeTemplateId && !isCreatingNew ? (
            <BuilderMasterSelector
              errorMsg={errorMsg}
              catalogLoading={catalogLoading}
              masterTemplates={masterTemplates}
              assignedTemplates={assignedTemplates}
              solidCardBg={solidCardBg}
              bronzeGold={bronzeGold}
              theme={theme}
              setTemplateName={setTemplateName}
              setTemplateDesc={setTemplateDesc}
              setDays={setDays}
              setUseWeeklyStructure={setUseWeeklyStructure}
              setIsCreatingNew={setIsCreatingNew}
              setActiveTemplateId={setActiveTemplateId}
              loadExistingTemplate={loadExistingTemplate}
              handleDeleteTemplate={handleDeleteTemplate}
              handleExportMasterTemplate={handleExportMasterTemplate}
              handleImportMasterTemplate={handleImportMasterTemplate}
              exportingTemplateId={exportingTemplateId}
              importingTemplate={importingTemplate}
            />
          ) : (
            <View style={{ width: '100%', gap: 20 }}>
              {errorMsg && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}

              <BuilderHeader
                templateName={templateName}
                setTemplateName={setTemplateName}
                templateDesc={templateDesc}
                setTemplateDesc={setTemplateDesc}
                useWeeklyStructure={useWeeklyStructure}
                handleToggleWeeklyStructure={handleToggleWeeklyStructure}
                theme={theme}
                inactiveBorder={inactiveBorder}
              />

              <BuilderWeekNavigator
                weeks={weeks}
                activeWeek={activeWeek}
                setActiveWeek={setActiveWeek}
                setWeeks={setWeeks}
                handleDeleteWeek={handleDeleteWeek}
                theme={theme}
                bronzeGold={bronzeGold}
              />

              <View style={{ gap: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>PROGRAM DAYS & BLOCKS</Text>
                  {!useWeeklyStructure && (
                    <LinearGradient
                      colors={['#7E57C2', '#FF5252', '#FF7043']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ padding: 1.2, borderRadius: 12 }}
                    >
                      <TouchableOpacity
                        style={{
                          backgroundColor: solidCardBg,
                          borderRadius: 11,
                          paddingVertical: 5,
                          paddingHorizontal: 12,
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}
                        onPress={() => handleAddDay()}
                      >
                        <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 }}>+ ADD DAY</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  )}
                </View>

                {days.length === 0 ? (
                  <View style={[styles.emptyCard, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                    <Text style={[styles.emptyCardText, { color: theme.text.secondary }]}>
                      NO DAYS ADDED YET. CLICK '+ ADD DAY' TO START BUILDING.
                    </Text>
                  </View>
                ) : (
                  days.map((day, dayIdx) => (
                    <BuilderDayCard
                      key={day.id}
                      day={day}
                      dayIdx={dayIdx}
                      daysLength={days.length}
                      theme={theme}
                      mode={mode as "light" | "dark"}
                      bronzeGold={bronzeGold}
                      solidCardBg={solidCardBg}
                      inactiveBorder={inactiveBorder}
                      useWeeklyStructure={useWeeklyStructure}
                      expandedDays={expandedDays}
                      toggleDay={toggleDay}
                      handleUpdateDayName={handleUpdateDayName}
                      handleUpdateDayFocusTag={handleUpdateDayFocusTag}
                      handleDeleteDay={handleDeleteDay}
                      handleMoveDay={handleMoveDay}
                      handleAddBlockToDay={handleAddBlockToDay}
                      expandedBlocks={expandedBlocks}
                      athleteLogs={athleteLogs}
                      toggleBlock={toggleBlock}
                      handleUpdateBlockValue={handleUpdateBlockValue}
                      handleUpdateExerciseValue={handleUpdateExerciseValue}
                      handleDeleteExerciseFromBlock={handleDeleteExerciseFromBlock}
                      handleOpenPicker={handleOpenPicker}
                      handleMoveBlockWithinDay={handleMoveBlockWithinDay}
                      handleOpenCopyModal={handleOpenCopyModal}
                      handleOpenCopyDayModal={handleOpenCopyDayModal}
                      handleDeleteBlockFromDay={handleDeleteBlockFromDay}
                    />
                  ))
                )}
              </View>

              <View style={{ marginTop: 24, paddingBottom: 40 }}>
                <Button
                  title={templateId ? "UPDATE WORKOUT PROGRAM" : "SAVE PROGRAM TEMPLATE"}
                  onPress={handleSaveTemplate}
                  loading={loading}
                />
              </View>
            </View>
          )}
        </ScrollView>

        <ExercisePickerModal
          visible={pickerModalVisible}
          onClose={() => { setPickerModalVisible(false); setSelectedBlockIdForAdd(null); }}
          onSelectExercise={handleAddExerciseToBlock}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          exerciseLibrary={exerciseLibrary}
          libraryLoading={libraryLoading}
          categories={categories}
        />

        <CopyBlockModal
          visible={copyModalVisible}
          onClose={() => { setCopyModalVisible(false); setSourceBlock(null); setSourceDay(null); }}
          sourceBlock={sourceBlock}
          sourceDay={sourceDay}
          copyView={copyView}
          setCopyView={setCopyView}
          days={days}
          weeks={weeks}
          activeWeek={activeWeek}
          otherTemplates={otherTemplates}
          targetBlocks={targetBlocks}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          successMessage={successMessage}
          coachId={coachId}
          onCopyDay={handleCopyDay}
          onDuplicateBlockToDay={handleDuplicateBlockToDay}
          onCopyDayToDay={handleCopyDayToDay}
          onFetchOtherTemplates={fetchOtherTemplates}
          onFetchTargetBlocks={fetchTargetBlocksForTemplate}
          onCopyTemplate={handleCopyTemplate}
        />
      </KeyboardAvoidingView>
    </GlobalErrorBoundary>
  );
}
