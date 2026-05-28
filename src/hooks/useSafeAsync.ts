import { useState, useCallback } from 'react';
import { useMountedRef } from './useMountedRef';
import { handleAsyncError } from '../lib/asyncErrorHandler';

export function useSafeAsync() {
  const [isExecuting, setIsExecuting] = useState(false);
  const isMounted = useMountedRef();

  const runAsync = useCallback(async (
    asyncFn: () => Promise<void>,
    options?: {
      onSuccess?: () => void;
      onError?: (e: any) => void;
      errorMessage?: string;
    }
  ) => {
    if (isExecuting) return;
    setIsExecuting(true);
    
    try {
      await asyncFn();
      if (isMounted.current && options?.onSuccess) {
        options.onSuccess();
      }
    } catch (e: any) {
      if (isMounted.current) {
        if (options?.onError) {
          options.onError(e);
        } else {
          handleAsyncError(e, options?.errorMessage);
        }
      }
    } finally {
      if (isMounted.current) {
        setIsExecuting(false);
      }
    }
  }, [isExecuting, isMounted]);

  return { runAsync, isExecuting };
}
