import { Alert } from 'react-native';

export function handleAsyncError(error: any, context?: string) {
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
  
  Alert.alert(context || 'Error', message);
}
