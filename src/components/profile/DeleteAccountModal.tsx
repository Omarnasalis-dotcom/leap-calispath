import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export function DeleteAccountModal() {
  const { theme } = useTheme();
  const { user, signInWithGoogle, signInWithApple } = useAuth();
  // "The first provider that the user used to sign up with" (Supabase's own
  // doc comment on app_metadata.provider). Google/Apple accounts never set a
  // password, so signInWithPassword below would always fail for them with
  // "invalid credentials" — re-auth has to happen through whichever method
  // actually created the account instead.
  const provider = user?.app_metadata?.provider;
  const isSocialAccount = provider === 'google' || provider === 'apple';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    if (!isSocialAccount && !deletePassword.trim()) {
      setDeleteError('Please enter your password.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError('');

    try {
      if (isSocialAccount) {
        // Re-running the same OAuth flow the account was created with is the
        // re-authentication check here — there's no password to verify, so
        // if the user can complete it again, that proves it's them. A silent
        // cancel (signInWithGoogle/signInWithApple return false, not a
        // thrown error) must NOT fall through to deletion — the user was
        // already signed in before opening this modal, so skipping this
        // check would let anyone with the phone unlocked delete the account
        // with no verification at all.
        const verified = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
        if (!verified) {
          setDeleteError(`Verification with ${provider === 'google' ? 'Google' : 'Apple'} was cancelled.`);
          setDeleteLoading(false);
          return;
        }
      } else {
        // Re-authenticate to verify password
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user!.email!,
          password: deletePassword,
        });

        if (signInError) {
          if (signInError.status === 400 || signInError.message.toLowerCase().includes('invalid')) {
            setDeleteError('Incorrect password. Please try again.');
          } else {
            setDeleteError(signInError.message || 'Authentication failed. Please try again.');
          }
          setDeleteLoading(false);
          return;
        }
      }

      // Step 2: Get fresh session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDeleteError('Session expired. Please restart the app.');
        setDeleteLoading(false);
        return;
      }

      // Step 3: Call the Edge Function
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user-account`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setDeleteError(result.error || 'Deletion failed. Please try again.');
        setDeleteLoading(false);
        return;
      }

      // Step 4: Sign out and clear local state
      await supabase.auth.signOut();

    } catch (error) {
      setDeleteError('Something went wrong. Please try again.');
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => {
          setDeletePassword('');
          setDeleteError('');
          setShowDeleteModal(true);
        }}
        style={{
          marginHorizontal: 16,
          marginTop: 24,
          marginBottom: 32,
          padding: 16,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: 'rgba(226,75,74,0.3)',
          backgroundColor: 'rgba(226,75,74,0.05)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#e24b4a', fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>
            DELETE ACCOUNT
          </Text>
          <Text style={{ color: 'rgba(226,75,74,0.6)', fontSize: 11, marginTop: 2 }}>
            Permanently removes all your data
          </Text>
        </View>
        <Text style={{ color: 'rgba(226,75,74,0.4)', fontSize: 16 }}>›</Text>
      </TouchableOpacity>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: theme.card.background,
            borderRadius: 16,
            padding: 28,
            width: '100%',
            borderWidth: 1,
            borderColor: '#e24b4a',
          }}>
            <Text style={{
              color: '#e24b4a',
              fontSize: 18,
              fontWeight: '800',
              textAlign: 'center',
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}>
              Delete Account
            </Text>

            <Text style={{
              color: theme.text.secondary,
              fontSize: 13,
              textAlign: 'center',
              lineHeight: 20,
              marginBottom: 24,
            }}>
              This is permanent and cannot be undone.{'\n'}
              All your tiers, trial history, rankings,{'\n'}
              and progress will be deleted forever.
            </Text>

            <Text style={{
              color: theme.text.tertiary,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 8,
              textAlign: isSocialAccount ? 'center' : 'left',
            }}>
              {isSocialAccount
                ? `Verify with ${provider === 'google' ? 'Google' : 'Apple'} to continue`
                : 'Confirm your password to continue'}
            </Text>
            {!isSocialAccount && (
              <TextInput
                value={deletePassword}
                onChangeText={(text) => {
                  setDeletePassword(text);
                  setDeleteError('');
                }}
                placeholder="Enter your password"
                placeholderTextColor={theme.text.tertiary}
                secureTextEntry
                style={{
                  backgroundColor: theme.card.background,
                  borderWidth: 1,
                  borderColor: deleteError ? '#e24b4a' : theme.card.border,
                  borderRadius: 8,
                  padding: 14,
                  color: theme.text.primary,
                  fontSize: 14,
                  marginBottom: 8,
                }}
              />
            )}

            {deleteError ? (
              <Text style={{
                color: '#e24b4a',
                fontSize: 12,
                marginBottom: 12,
                textAlign: 'center',
              }}>
                {deleteError}
              </Text>
            ) : (
              <View style={{ height: 20 }} />
            )}

            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
              style={{
                backgroundColor: deleteLoading ? '#333' : '#e24b4a',
                borderRadius: 8,
                paddingVertical: 14,
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{
                color: '#fff',
                fontWeight: '800',
                fontSize: 14,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}>
                {deleteLoading ? 'Deleting...' : isSocialAccount ? `Verify & Delete` : 'Permanently Delete'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowDeleteModal(false);
                setDeletePassword('');
                setDeleteError('');
              }}
              disabled={deleteLoading}
              style={{
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: '#666',
                fontSize: 13,
                fontWeight: '600',
              }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
