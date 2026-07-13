import { Alert } from 'react-native';

// Turns a raw error (often a bare fetch/RPC failure like "Network request
// failed") into copy a user can actually act on. Shared by every call site
// that shows an error alert, native or web, rather than each one re-deciding
// whether "Network request failed" is user-facing text.
export function getFriendlyErrorMessage(error: any): string {
  let message = 'An unexpected error occurred. Please try again.';
  if (error?.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  if (message.includes('PGRST116')) {
    message = 'Data not found or you do not have permission.';
  } else if (message.includes('Failed to fetch') || message.includes('Network request failed')) {
    message = 'Network connection lost. Please check your internet connection.';
  }

  return message;
}

export function handleAsyncError(error: any, context?: string) {
  Alert.alert(context || 'Error', getFriendlyErrorMessage(error));
}
