import { useState, useCallback } from 'react';
import { Alert } from 'react-native';

interface SafeMutationOptions<T> {
  onSuccess?: (data: T | null) => void;
  onError?: (error: any) => void;
  errorMessage?: string;
  rollback?: () => void;
  skipAlert?: boolean;
}

export function useSafeMutation() {
  const [isMutating, setIsMutating] = useState(false);

  const safeMutate = useCallback(async <T,>(
    mutationFn: () => Promise<{ data?: T | null; error?: any }>,
    options?: SafeMutationOptions<T>
  ) => {
    if (isMutating) return { data: null, error: new Error('Mutation already in progress') };

    setIsMutating(true);
    try {
      const { data, error } = await mutationFn();

      if (error) {
        console.error('Mutation error:', error);
        
        if (options?.rollback) {
          options.rollback();
        }
        
        if (options?.onError) {
          options.onError(error);
        } else if (!options?.skipAlert) {
          Alert.alert(
            'Error',
            options?.errorMessage || error?.message || 'An error occurred while saving. Please try again.'
          );
        }
        return { data: null, error };
      }

      if (options?.onSuccess) {
        options.onSuccess(data ?? null);
      }
      return { data, error: null };
    } catch (err: any) {
      console.error('Unexpected error during mutation:', err);
      
      if (options?.rollback) {
        options.rollback();
      }
      
      if (options?.onError) {
        options.onError(err);
      } else if (!options?.skipAlert) {
        Alert.alert(
          'Error',
          options?.errorMessage || err?.message || 'An unexpected error occurred. Please try again.'
        );
      }
      return { data: null, error: err };
    } finally {
      setIsMutating(false);
    }
  }, [isMutating]);

  return { safeMutate, isMutating };
}
