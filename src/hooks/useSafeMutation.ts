import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { t } from '../i18n';
import { useMountedRef } from './useMountedRef';

interface SafeMutationOptions<T> {
  onSuccess?: (data: T | null) => void;
  onError?: (error: any) => void;
  errorMessage?: string;
  rollback?: () => void;
  skipAlert?: boolean;
  // For errors that are an expected, already-handled validation outcome
  // (e.g. "can't delete, it's still in use") rather than a genuine bug —
  // skips the console.error that otherwise triggers a dev-mode redbox.
  skipConsoleError?: boolean;
}

export function useSafeMutation() {
  const [isMutating, setIsMutating] = useState(false);
  const mutatingRef = useRef(false);
  const isMounted = useMountedRef();

  const safeMutate = useCallback(async <T,>(
    mutationFn: () => Promise<{ data?: T | null; error?: any }>,
    options?: SafeMutationOptions<T>
  ) => {
    if (mutatingRef.current) return { data: null, error: new Error('Mutation already in progress') };
    mutatingRef.current = true;

    if (isMounted.current) {
      setIsMutating(true);
    }
    try {
      const { data, error } = await mutationFn();

      if (error) {
        if (!options?.skipConsoleError) {
          console.error('Mutation error:', error);
        }

        if (options?.rollback) {
          options.rollback();
        }
        
        if (options?.onError) {
          options.onError(error);
        } else if (!options?.skipAlert) {
          Alert.alert(
            t('errors.generic'),
            options?.errorMessage || error?.message || t('errors.saveFailedGeneric')
          );
        }
        return { data: null, error };
      }

      if (options?.onSuccess) {
        options.onSuccess(data ?? null);
      }
      return { data, error: null };
    } catch (err: any) {
      if (!options?.skipConsoleError) {
        console.error('Unexpected error during mutation:', err);
      }

      if (options?.rollback) {
        options.rollback();
      }
      
      if (options?.onError) {
        options.onError(err);
      } else if (!options?.skipAlert) {
        Alert.alert(
          t('errors.generic'),
          options?.errorMessage || err?.message || t('errors.unexpected')
        );
      }
      return { data: null, error: err };
    } finally {
      mutatingRef.current = false;
      if (isMounted.current) {
        setIsMutating(false);
      }
    }
  }, [isMounted]);

  return { safeMutate, isMutating };
}
