import { useAuth } from '../contexts/AuthContext';

export const ADMIN_EMAIL = 'omarnasalis@outlook.com';

export class AdminService {
  /**
   * Checks if the current user has tournament administrative powers
   */
  static isAdmin(email: string | undefined): boolean {
    if (!email) return false;
    return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }
}
