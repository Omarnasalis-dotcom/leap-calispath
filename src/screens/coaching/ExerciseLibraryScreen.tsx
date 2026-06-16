import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
  Linking,
  KeyboardAvoidingView,
  TextInput } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';


interface Exercise {
  id: string | number;
  name: string;
  youtube_url: string;
  category: 'push' | 'pull' | 'legs' | 'core' | 'skill' | 'flexibility' | 'strength' | 'mobility';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  created_by: string;
  created_at?: string;
}

interface ExerciseLibraryScreenProps {
  isAdmin?: boolean;
  isCoach?: boolean;
}

export function ExerciseLibraryScreen({ isAdmin = false, isCoach = false }: ExerciseLibraryScreenProps) {
  const { user } = useAuth();
  const { theme, mode } = useTheme();
  const solidCardBg = mode === 'dark' ? '#151515' : '#FFFFFF';
  const inactiveBorder = mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
  const bronzeGold = '#C8A040';

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pagination States
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFocus, setSelectedFocus] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Video Preview State (Removed Modal)

  // Single Add Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newYoutubeUrl, setNewYoutubeUrl] = useState('');
  const [newCategory, setNewCategory] = useState<'push' | 'pull' | 'legs' | 'core'>('push');
  const [newConcept, setNewConcept] = useState<'skill' | 'flexibility' | 'strength' | 'mobility'>('skill');
  const [newDifficulty, setNewDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Bulk Import Modal States
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [csvText, setCsvText] = useState('');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const categories = ['all', 'push', 'pull', 'legs', 'core'];
  const focuses = ['all', 'skill', 'flexibility', 'strength', 'mobility'];
  const difficulties = ['all', 'beginner', 'intermediate', 'advanced'];

  const formCategories: Array<'push' | 'pull' | 'legs' | 'core'> = ['push', 'pull', 'legs', 'core'];
  const formConcepts: Array<'skill' | 'flexibility' | 'strength' | 'mobility'> = ['skill', 'flexibility', 'strength', 'mobility'];
  const formDifficulties: Array<'beginner' | 'intermediate' | 'advanced'> = ['beginner', 'intermediate', 'advanced'];

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    fetchExercises(true);
  }, [selectedCategory, selectedFocus, selectedDifficulty, debouncedQuery]);

  async function fetchExercises(isRefresh = false) {
    if (isRefresh) {
      setLoading(true);
      setPage(0);
      setHasMore(true);
    } else {
      if (!hasMore || loadingMore) return;
      setLoadingMore(true);
    }
    
    setErrorMsg(null);
    try {
      const currentPage = isRefresh ? 0 : page;
      const start = currentPage * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      let query = supabase
        .from('exercise_library')
        .select('*', { count: 'exact' });

      if (selectedCategory !== 'all') {
        query = query.ilike('category', `%${selectedCategory}%`);
      }
      if (selectedFocus !== 'all') {
        query = query.ilike('category', `%${selectedFocus}%`);
      }
      if (selectedDifficulty !== 'all') {
        query = query.eq('difficulty', selectedDifficulty);
      }
      if (debouncedQuery.trim()) {
        query = query.ilike('name', `%${debouncedQuery.trim()}%`);
      }

      const { data, count, error } = await query
        .order('name', { ascending: true })
        .range(start, end);

      if (error) throw error;

      if (isRefresh) {
        setExercises(data || []);
      } else {
        setExercises(prev => [...prev, ...(data || [])]);
      }

      setHasMore((count || 0) > end + 1);
      if (!isRefresh) {
        setPage(currentPage + 1);
      } else {
        setPage(1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'FAILED TO LOAD EXERCISE LIBRARY.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const handleStartEdit = (ex: Exercise) => {
    const parts = (ex.category || '').split(',').map(p => p.trim().toLowerCase());
    const catVal = parts.find(p => ['push', 'pull', 'legs', 'core'].includes(p)) as any || 'push';
    const conVal = parts.find(p => ['skill', 'flexibility', 'strength', 'mobility'].includes(p)) as any || 'skill';

    setNewName(ex.name);
    setNewYoutubeUrl(ex.youtube_url);
    setNewCategory(catVal);
    setNewConcept(conVal);
    setNewDifficulty(ex.difficulty as any || 'beginner');
    setEditingExercise(ex);
    setModalError(null);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setNewName('');
    setNewYoutubeUrl('');
    setNewCategory('push');
    setNewConcept('skill');
    setNewDifficulty('beginner');
    setEditingExercise(null);
    setModalError(null);
  };

  async function handleAddExercise() {
    setModalError(null);
    if (!newName.trim() || !newYoutubeUrl.trim()) {
      setModalError('PLEASE FILL IN ALL FIELDS.');
      return;
    }

    if (!newYoutubeUrl.includes('youtube.com') && !newYoutubeUrl.includes('youtu.be')) {
      setModalError('PLEASE PROVIDE A VALID YOUTUBE URL.');
      return;
    }

    setSaving(true);
    try {
      const finalCategory = [newCategory, newConcept].filter(Boolean).join(',');

      if (editingExercise) {
        const { error } = await supabase
          .from('exercise_library')
          .update({
            name: newName.trim(),
            youtube_url: newYoutubeUrl.trim(),
            category: finalCategory,
            difficulty: newDifficulty
          })
          .eq('id', editingExercise.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('exercise_library')
          .insert({
            name: newName.trim(),
            youtube_url: newYoutubeUrl.trim(),
            category: finalCategory,
            difficulty: newDifficulty,
            created_by: user?.id
          });

        if (error) throw error;
      }

      handleCloseModal();
      fetchExercises(true);
    } catch (err: any) {
      setModalError(err.message?.toUpperCase() || 'FAILED TO SAVE EXERCISE.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExercise(id: string | number) {
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from('exercise_library')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchExercises();
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO DELETE EXERCISE.');
    }
  }

  function getYouTubeEmbedUrl(url: string): string {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return `https://www.youtube.com/embed/${match[2]}?autoplay=1`;
    }
    return url;
  }

  const handleOpenVideo = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.youtube.com`);
      });
    }
  };

  // CSV Parsing Engine
  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const rowData: any = {};
      headers.forEach((header, index) => {
        let val = values[index] || '';
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        rowData[header] = val;
      });

      if (rowData.name && (rowData.category || rowData.concept) && rowData.difficulty) {
        rows.push(rowData);
      }
    }
    return rows;
  }

  // Download Template CSV Handler
  const handleDownloadTemplate = async () => {
    const csvContent = "name,youtube_url,category,concept,difficulty\n" +
      "Muscle Up,https://youtube.com/watch?v=1234567,,skill,intermediate\n" +
      "Pancake Stretch,https://youtube.com/watch?v=2345678,,flexibility,beginner\n" +
      "Weighted Pullup,https://youtube.com/watch?v=3456789,,strength,advanced\n" +
      "Scapular Rotations,https://youtube.com/watch?v=4567890,,mobility,beginner\n" +
      "Handstand Pushup,https://youtube.com/watch?v=5678901,push,,advanced\n" +
      "Pullup,https://youtube.com/watch?v=6789012,pull,,intermediate\n" +
      "Pistol Squat,https://youtube.com/watch?v=7890123,legs,,beginner\n" +
      "Hanging Knee Raise,https://youtube.com/watch?v=8901234,core,,beginner\n";

    if (Platform.OS === 'web') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "exercise_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      try {
        const FileSystem = require('expo-file-system/legacy');
        const Sharing = require('expo-sharing');
        const fileUri = FileSystem.documentDirectory + 'exercise_template.csv';
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
        await Sharing.shareAsync(fileUri);
      } catch (err) {
        console.error("Error sharing CSV template:", err);
      }
    }
  };

  // Upload/Parse CSV File Trigger (Web & Native Paste Fallback)
  const triggerFileSelect = async () => {
    setImportError(null);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (text) {
              const parsed = parseCSV(text);
              if (parsed.length === 0) {
                setImportError('NO VALID EXERCISE ROWS FOUND IN CSV.');
              } else {
                setPreviewRows(parsed);
                setImportStep(2);
              }
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    } else {
      // Native: show paste UI (file picker requires native build)
      setImportStep(1);
    }
  };

  const handlePasteCSVSubmit = () => {
    setImportError(null);
    if (!csvText.trim()) {
      setImportError('PLEASE PASTE CSV CONTENT OR FILE TEXT FIRST.');
      return;
    }
    const parsed = parseCSV(csvText);
    if (parsed.length === 0) {
      setImportError('FAILED TO PARSE ANY VALID ROWS. CHECK YOUR FORMAT.');
    } else {
      setPreviewRows(parsed);
      setImportStep(2);
    }
  };

  const handleConfirmImport = async () => {
    setImportSaving(true);
    setImportError(null);
    try {
      // Safety: limit bulk imports to 200 rows
      if (previewRows.length > 200) {
        setImportError('MAXIMUM 200 EXERCISES PER IMPORT. PLEASE SPLIT YOUR CSV.');
        setImportSaving(false);
        return;
      }
      const inserts = previewRows.map(row => {
        const cats = [];
        if (row.category && row.category.trim()) cats.push(row.category.toLowerCase().trim());
        if (row.concept && row.concept.trim()) cats.push(row.concept.toLowerCase().trim());
        const finalCategory = cats.length > 0 ? cats.join(',') : 'push';

        return {
          name: row.name.trim(),
          youtube_url: row.youtube_url && (row.youtube_url.includes('youtube.com') || row.youtube_url.includes('youtu.be'))
            ? row.youtube_url.trim()
            : '',
          category: finalCategory,
          difficulty: (row.difficulty || 'beginner').toLowerCase().trim(),
          created_by: user?.id
        };
      });

      const { error } = await supabase
        .from('exercise_library')
        .insert(inserts);

      if (error) throw error;

      setBulkModalVisible(false);
      setPreviewRows([]);
      setCsvText('');
      setImportStep(1);
      fetchExercises(true);
    } catch (err: any) {
      setImportError(err.message?.toUpperCase() || 'FAILED TO IMPORT EXERCISES.');
    } finally {
      setImportSaving(false);
    }
  };

  const canAdd = isAdmin || isCoach;



  // Render Exercise Item for FlatList
  const renderExercise = useCallback(({ item: ex }: { item: Exercise }) => {
    const isOwner = ex.created_by === user?.id;
    const showDelete = isAdmin || (isCoach && isOwner);

    return (
      <LinearGradient
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ padding: 1.2, borderRadius: 12, marginBottom: 16 }}
      >
        <View
          style={{
            backgroundColor: solidCardBg,
            borderRadius: 11,
            padding: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <View style={styles.cardInfo}>
            <Text style={[styles.exerciseName, { color: theme.text.primary }]}>
              {ex.name.toUpperCase()}
            </Text>

            <View style={styles.badgeRow}>
              {(ex.category || '').split(',').map((catPart, catIdx) => {
                const trimmed = catPart.trim();
                if (!trimmed) return null;
                return (
                  <LinearGradient
                    key={catIdx}
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ padding: 1, borderRadius: 12, marginRight: 6 }}
                  >
                    <View style={{ backgroundColor: solidCardBg, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 11 }}>
                      <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: '#C8A040' }}>{trimmed.toUpperCase()}</Text>
                    </View>
                  </LinearGradient>
                );
              })}
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ padding: 1, borderRadius: 12 }}
              >
                <View style={{ backgroundColor: solidCardBg, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 11 }}>
                  <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.secondary }}>{ex.difficulty.toUpperCase()}</Text>
                </View>
              </LinearGradient>
            </View>
          </View>

          <View style={styles.cardActions}>
            {ex.youtube_url ? (
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 12, padding: 1.2 }}
              >
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: solidCardBg,
                    paddingVertical: 5,
                    paddingHorizontal: 12,
                    borderRadius: 11,
                    gap: 6,
                    width: 110
                  }}
                  onPress={() => handleOpenVideo(ex.youtube_url)}
                >
                  <Text style={{ color: '#FF5252', fontSize: 10 }}>▶</Text>
                  <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5, color: theme.text.primary }}>PLAY VIDEO</Text>
                </TouchableOpacity>
              </LinearGradient>
            ) : null}

            {showDelete && (
              <View style={{ gap: 6 }}>
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 12, padding: 1.2 }}
                >
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: solidCardBg,
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      borderRadius: 11,
                      gap: 6,
                      width: 110
                    }}
                    onPress={() => handleStartEdit(ex)}
                  >
                    <Text style={{ color: '#FF7043', fontSize: 10 }}>✎</Text>
                    <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5, color: theme.text.primary }}>EDIT</Text>
                  </TouchableOpacity>
                </LinearGradient>

                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 12, padding: 1.2 }}
                >
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: solidCardBg,
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      borderRadius: 11,
                      gap: 6,
                      width: 110
                    }}
                    onPress={() => handleDeleteExercise(ex.id)}
                  >
                    <Text style={{ color: '#FF5252', fontSize: 10 }}>✖</Text>
                    <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5, color: '#FF5252' }}>DELETE</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    );
  }, [isAdmin, isCoach, user?.id, solidCardBg, theme, handleOpenVideo, handleStartEdit, handleDeleteExercise]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* ACTION CONTROLS */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 16, paddingHorizontal: 20 }}>
        {isAdmin && (
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ padding: 1.2, borderRadius: 8 }}
          >
            <TouchableOpacity
              style={{
                backgroundColor: solidCardBg,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 7,
                alignItems: 'center',
              }}
              onPress={() => {
                setImportStep(1);
                setBulkModalVisible(true);
              }}
            >
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1, color: bronzeGold }}>BULK IMPORT</Text>
            </TouchableOpacity>
          </LinearGradient>
        )}
        {canAdd && (
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ padding: 1.2, borderRadius: 8 }}
          >
            <TouchableOpacity
              style={{
                backgroundColor: solidCardBg,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 7,
                alignItems: 'center',
              }}
              onPress={() => setModalVisible(true)}
            >
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1, color: theme.text.primary }}>ADD EXERCISE</Text>
            </TouchableOpacity>
          </LinearGradient>
        )}
      </View>

      {/* SEARCH BAR */}
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <TextInput
          placeholder="Search movements..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ backgroundColor: solidCardBg, borderRadius: 8, borderWidth: 1, borderColor: inactiveBorder, padding: 16, color: theme.text.primary, fontSize: 16 }}
          placeholderTextColor={theme.text.tertiary}
        />
      </View>

      {/* FILTER CONTROLS */}
      <View style={styles.filterSection}>
        <Text style={[styles.filterLabel, { color: theme.text.secondary }]}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingRight: 20 }}>
          {categories.map((cat) => (
            <LinearGradient
              key={cat}
              colors={selectedCategory === cat ? ['#7E57C2', '#FF5252', '#FF7043'] : [inactiveBorder, inactiveBorder]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ padding: 1.2, borderRadius: 12, marginRight: 8 }}
            >
              <TouchableOpacity
                style={{
                  backgroundColor: selectedCategory === cat ? 'transparent' : solidCardBg,
                  borderRadius: 11,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={{
                    fontFamily: 'BarlowCondensed-Bold',
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: selectedCategory === cat ? '#FFFFFF' : theme.text.secondary
                  }}
                >
                  {cat.toUpperCase()}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          ))}
        </ScrollView>

        <Text style={[styles.filterLabel, { color: theme.text.secondary, marginTop: 12 }]}>MOVEMENT CONCEPT / TYPE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingRight: 20 }}>
          {focuses.map((foc) => (
            <LinearGradient
              key={foc}
              colors={selectedFocus === foc ? ['#7E57C2', '#FF5252', '#FF7043'] : [inactiveBorder, inactiveBorder]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ padding: 1.2, borderRadius: 12, marginRight: 8 }}
            >
              <TouchableOpacity
                style={{
                  backgroundColor: selectedFocus === foc ? 'transparent' : solidCardBg,
                  borderRadius: 11,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
                onPress={() => setSelectedFocus(foc)}
              >
                <Text
                  style={{
                    fontFamily: 'BarlowCondensed-Bold',
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: selectedFocus === foc ? '#FFFFFF' : theme.text.secondary
                  }}
                >
                  {foc.toUpperCase()}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          ))}
        </ScrollView>

        <Text style={[styles.filterLabel, { color: theme.text.secondary, marginTop: 12 }]}>DIFFICULTY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingRight: 20 }}>
          {difficulties.map((diff) => (
            <LinearGradient
              key={diff}
              colors={selectedDifficulty === diff ? ['#7E57C2', '#FF5252', '#FF7043'] : [inactiveBorder, inactiveBorder]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ padding: 1.2, borderRadius: 12, marginRight: 8 }}
            >
              <TouchableOpacity
                style={{
                  backgroundColor: selectedDifficulty === diff ? 'transparent' : solidCardBg,
                  borderRadius: 11,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
                onPress={() => setSelectedDifficulty(diff)}
              >
                <Text
                  style={{
                    fontFamily: 'BarlowCondensed-Bold',
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: selectedDifficulty === diff ? '#FFFFFF' : theme.text.secondary
                  }}
                >
                  {diff.toUpperCase()}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          ))}
        </ScrollView>
      </View>

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {/* EXERCISE LIST */}
      {loading ? (
        <View style={styles.centerContainer}>
          <LeapLogo size={40} animated />
          <Text style={[styles.loadingText, { color: theme.text.secondary }]}>LOADING EXERCISES...</Text>
        </View>
      ) : exercises.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyText, { color: theme.text.secondary }]}>NO EXERCISES FOUND MATCHING FILTERS.</Text>
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderExercise}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={{
                  alignItems: 'center',
                  paddingVertical: 20,
                  opacity: loadingMore ? 0.5 : 1
                }}
                onPress={() => fetchExercises(false)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <LeapLogo size={30} animated />
                ) : (
                  <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 }}>
                    LOAD MORE EXERCISES
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>
                  END OF RESULTS
                </Text>
              </View>
            )
          }
        />
      )}

      {/* ADD EXERCISE MODAL */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>
              {editingExercise ? 'EDIT' : 'ADD NEW'} <Text style={{ color: bronzeGold }}>EXERCISE</Text>
            </Text>

            {modalError && (
              <View style={styles.modalErrorBanner}>
                <Text style={styles.modalErrorText}>{modalError}</Text>
              </View>
            )}

            <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
              <Input
                label="EXERCISE NAME"
                placeholder="E.G. MUSCLE UP"
                value={newName}
                onChangeText={setNewName}
              />

              <Input
                label="YOUTUBE URL"
                placeholder="E.G. HTTPS://YOUTUBE.COM/WATCH?V=..."
                value={newYoutubeUrl}
                onChangeText={setNewYoutubeUrl}
                autoCapitalize="none"
              />

              {/* Category Selector */}
              <Text style={[styles.dropdownLabel, { color: theme.text.secondary }]}>CATEGORY</Text>
              <View style={styles.dropdownGrid}>
                {formCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.selectorOption,
                      { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: theme.card.border },
                      newCategory === cat && { borderColor: bronzeGold, backgroundColor: 'rgba(200,160,64,0.08)' }
                    ]}
                    onPress={() => setNewCategory(cat)}
                  >
                    <Text style={[styles.selectorOptionText, { color: theme.text.secondary }, newCategory === cat && { color: bronzeGold, fontWeight: 'bold' }]}>
                      {cat.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Movement Concept Selector */}
              <Text style={[styles.dropdownLabel, { color: theme.text.secondary, marginTop: 16 }]}>MOVEMENT CONCEPT / TYPE</Text>
              <View style={styles.dropdownGrid}>
                {formConcepts.map((con) => (
                  <TouchableOpacity
                    key={con}
                    style={[
                      styles.selectorOption,
                      { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: theme.card.border },
                      newConcept === con && { borderColor: bronzeGold, backgroundColor: 'rgba(200,160,64,0.08)' }
                    ]}
                    onPress={() => setNewConcept(con)}
                  >
                    <Text style={[styles.selectorOptionText, { color: theme.text.secondary }, newConcept === con && { color: bronzeGold, fontWeight: 'bold' }]}>
                      {con.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Difficulty Selector */}
              <Text style={[styles.dropdownLabel, { color: theme.text.secondary, marginTop: 16 }]}>DIFFICULTY</Text>
              <View style={styles.dropdownGrid}>
                {formDifficulties.map((diff) => (
                  <TouchableOpacity
                    key={diff}
                    style={[
                      styles.selectorOption,
                      { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: theme.card.border },
                      newDifficulty === diff && { borderColor: bronzeGold, backgroundColor: 'rgba(200,160,64,0.08)' }
                    ]}
                    onPress={() => setNewDifficulty(diff)}
                  >
                    <Text style={[styles.selectorOptionText, { color: theme.text.secondary }, newDifficulty === diff && { color: bronzeGold, fontWeight: 'bold' }]}>
                      {diff.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 24, gap: 12 }}>
                <Button
                  title={editingExercise ? "UPDATE EXERCISE" : "SAVE EXERCISE"}
                  onPress={handleAddExercise}
                  loading={saving}
                />

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCloseModal}
                >
                  <Text style={[styles.cancelButtonText, { color: theme.text.secondary }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* BULK IMPORT MODAL */}
      <Modal
        visible={bulkModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBulkModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold, maxWidth: 640 }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>
              BULK IMPORT <Text style={{ color: bronzeGold }}>EXERCISES</Text>
            </Text>

            {importError && (
              <View style={styles.modalErrorBanner}>
                <Text style={styles.modalErrorText}>{importError}</Text>
              </View>
            )}

            <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
              {importStep === 1 ? (
                <View style={{ gap: 20 }}>
                  <Text style={[styles.infoText, { color: theme.text.secondary }]}>
                    FOLLOW THE TWO STEPS BELOW TO IMPORT EXERCISES VIA CSV.
                  </Text>

                  {/* STEP 1 */}
                  <View style={[styles.stepContainer, { borderColor: theme.card.border }]}>
                    <Text style={[styles.stepTitle, { color: theme.text.primary }]}>STEP 1: DOWNLOAD CSV TEMPLATE</Text>
                    <Text style={[styles.stepDesc, { color: theme.text.secondary }]}>
                      GET THE PRE-FORMATTED CSV TEMPLATE CONTAINING EXAMPLES OF VALID EXERCISE CONFIGURATIONS.
                    </Text>
                    <TouchableOpacity
                      style={[styles.stepActionButton, { backgroundColor: 'rgba(200, 160, 64, 0.1)', borderColor: bronzeGold }]}
                      onPress={handleDownloadTemplate}
                    >
                      <Text style={[styles.stepActionButtonText, { color: bronzeGold }]}>DOWNLOAD TEMPLATE CSV</Text>
                    </TouchableOpacity>
                  </View>

                  {/* STEP 2 */}
                  <View style={[styles.stepContainer, { borderColor: theme.card.border }]}>
                    <Text style={[styles.stepTitle, { color: theme.text.primary }]}>STEP 2: UPLOAD FILLED CSV</Text>
                    <Text style={[styles.stepDesc, { color: theme.text.secondary }]}>
                      SELECT YOUR MODIFIED CSV FILE CONTAINING THE EXERCISES TO ADD TO THE LIBRARY.
                    </Text>

                    <TouchableOpacity
                      style={[styles.stepActionButton, { backgroundColor: bronzeGold, borderColor: bronzeGold }]}
                      onPress={triggerFileSelect}
                    >
                      <Text style={[styles.stepActionButtonText, { color: '#FFFFFF' }]}>UPLOAD CSV FILE</Text>
                    </TouchableOpacity>

                    {Platform.OS !== 'web' && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.stepDesc, { color: theme.text.secondary, marginBottom: 8 }]}>
                          OR PASTE THE RAW CSV CONTENTS DIRECTLY BELOW:
                        </Text>
                        <TextInput
                          style={[styles.textArea, { color: theme.text.primary, borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.02)' }]}
                          multiline
                          numberOfLines={6}
                          placeholder="name,youtube_url,category,difficulty&#10;Handstand,https://youtube.com/watch?v=123,skill,intermediate"
                          placeholderTextColor="rgba(255,255,255,0.2)"
                          value={csvText}
                          onChangeText={setCsvText}
                        />
                        <TouchableOpacity
                          style={[styles.stepActionButton, { backgroundColor: bronzeGold, borderColor: bronzeGold, marginTop: 12 }]}
                          onPress={handlePasteCSVSubmit}
                        >
                          <Text style={[styles.stepActionButtonText, { color: '#FFFFFF' }]}>PARSE PASTED CSV</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  <Text style={[styles.infoText, { color: theme.text.secondary }]}>
                    PREVIEW OF EXERCISES DETECTED IN YOUR CSV. VERIFY DETAILS BEFORE CONFIRMING IMPORT.
                  </Text>

                   {/* Table Header */}
                  <View style={[styles.tableHeader, { borderBottomColor: theme.card.border }]}>
                    <Text style={[styles.tableHeaderCell, { color: theme.text.primary, flex: 2 }]}>NAME</Text>
                    <Text style={[styles.tableHeaderCell, { color: theme.text.primary }]}>CATEGORY</Text>
                    <Text style={[styles.tableHeaderCell, { color: theme.text.primary }]}>CONCEPT</Text>
                    <Text style={[styles.tableHeaderCell, { color: theme.text.primary }]}>DIFFICULTY</Text>
                  </View>

                  {/* Table Body */}
                  <View style={styles.tableBody}>
                    {previewRows.map((row, idx) => (
                      <View key={idx} style={[styles.tableRow, { borderBottomColor: 'rgba(255,255,255,0.03)' }]}>
                        <Text style={[styles.tableCell, { color: theme.text.primary, flex: 2 }]} numberOfLines={1}>
                          {row.name.toUpperCase()}
                        </Text>
                        <Text style={[styles.tableCell, { color: bronzeGold }]}>
                          {(row.category || '').toUpperCase()}
                        </Text>
                        <Text style={[styles.tableCell, { color: bronzeGold }]}>
                          {(row.concept || '').toUpperCase()}
                        </Text>
                        <Text style={[styles.tableCell, { color: theme.text.secondary }]}>
                          {row.difficulty.toUpperCase()}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ marginTop: 24, gap: 12 }}>
                    <Button
                      title={`CONFIRM IMPORT (${previewRows.length} EXERCISES)`}
                      onPress={handleConfirmImport}
                      loading={importSaving}
                    />

                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        setPreviewRows([]);
                        setImportStep(1);
                      }}
                    >
                      <Text style={[styles.cancelButtonText, { color: theme.text.secondary }]}>BACK / START OVER</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setBulkModalVisible(false);
                    setPreviewRows([]);
                    setCsvText('');
                    setImportStep(1);
                  }}
                >
                  <Text style={[styles.cancelButtonText, { color: theme.text.secondary }]}>CLOSE IMPORT SYSTEM</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>



    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 26,
    letterSpacing: 1.5,
  },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1.5,
  },
  emptyText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
    textAlign: 'center',
  },
  listContainer: {
    gap: 16,
    paddingBottom: 24,
  },
  exerciseCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginRight: 16,
  },
  exerciseName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 18,
    letterSpacing: 1,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  cardActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  playButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  deleteButtonText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  editButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#C8A040',
  },
  editButtonText: {
    color: '#C8A040',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
  },
  errorText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    padding: 32,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 24,
    textTransform: 'uppercase',
    marginBottom: 20,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  modalErrorBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
    width: '100%',
  },
  modalErrorText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    textAlign: 'center',
  },
  dropdownLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  dropdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  selectorOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: '28%',
    alignItems: 'center',
  },
  selectorOptionText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  infoText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  stepContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  stepTitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 6,
  },
  stepDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 14,
  },
  stepActionButton: {
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  stepActionButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontFamily: 'Courier',
    fontSize: 11,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  tableHeaderCell: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
    flex: 1,
  },
  tableBody: {
    maxHeight: 250,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  tableCell: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    flex: 1,
    letterSpacing: 0.5,
  },
  videoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  videoContentCard: {
    width: '100%',
    maxWidth: 640,
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 16,
    overflow: 'hidden',
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  videoHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 1,
  },
  videoCloseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 6,
  },
});
