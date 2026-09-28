import { Alert } from 'react-native';
import { t, isArabic } from '../i18n';

// Supabase Auth error codes worth a translated message. English keeps
// Supabase's own wording (unchanged), so this is only used in Arabic.
const AUTH_ERROR_KEYS = {
  invalid_credentials: 'errors.invalidCredentials',
  user_already_exists: 'errors.userExists',
  email_exists: 'errors.userExists',
  email_not_confirmed: 'errors.emailNotConfirmed',
  over_email_send_rate_limit: 'errors.rateLimited',
  over_request_rate_limit: 'errors.rateLimited',
  weak_password: 'errors.weakPassword',
  email_address_invalid: 'errors.invalidEmail',
  same_password: 'errors.samePassword',
} as const;

// The Arabic message for a known Supabase Auth error, else undefined.
export function getTranslatedAuthError(error: any): string | undefined {
  const key = isArabic ? AUTH_ERROR_KEYS[error?.code as keyof typeof AUTH_ERROR_KEYS] : undefined;
  return key ? t(key) : undefined;
}

// Turns a raw error (often a bare fetch/RPC failure like "Network request
// failed") into copy a user can actually act on. Shared by every call site
// that shows an error alert, native or web, rather than each one re-deciding
// whether "Network request failed" is user-facing text.
export function getFriendlyErrorMessage(error: any): string {
  const translated = getTranslatedAuthError(error);
  if (translated) return translated;

  let message = t('errors.unexpected');
  if (error?.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  if (message.includes('PGRST116')) {
    message = t('errors.notFound');
  } else if (message.includes('Failed to fetch') || message.includes('Network request failed')) {
    message = t('errors.network');
  }

  return message;
}

export function handleAsyncError(error: any, context?: string) {
  Alert.alert(context || t('errors.generic'), getFriendlyErrorMessage(error));
}
