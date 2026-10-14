import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

// Supabase requires an email-shaped login ID. Usernames are turned into this
// placeholder address behind the scenes. It is never used to send mail.
const USERNAME_SUFFIX = '@faculty.invalid';

export interface AccessInfo {
  role: 'admin' | 'instructor';
  mustChangePassword: boolean;
  isActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor(private supabase: SupabaseService) {}

  // "jdelacruz" -> "jdelacruz@faculty.invalid". Full addresses typed in are used as-is.
  private toEmail(username: string): string {
    const clean = username.trim().toLowerCase();
    return clean.includes('@') ? clean : clean + USERNAME_SUFFIX;
  }

  async signIn(username: string, password: string) {
    return this.supabase.client.auth.signInWithPassword({
      email: this.toEmail(username),
      password
    });
  }

  async signOut() {
    return this.supabase.client.auth.signOut();
  }

  async getSession() {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session;
  }

  // Who is signed in, what role they have, and whether they may proceed
  async getAccess(): Promise<AccessInfo | null> {
    const session = await this.getSession();
    if (!session?.user) return null;

    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('role, must_change_password, is_active')
      .eq('id', session.user.id)
      .single();

    if (error || !data) return null;

    return {
      role: data.role,
      mustChangePassword: data.must_change_password,
      isActive: data.is_active
    };
  }

  // Where each person belongs after signing in
  routeFor(access: AccessInfo): string {
    if (access.mustChangePassword) return '/change-password';
    return access.role === 'admin' ? '/admin' : '/dashboard';
  }

  async changePassword(newPassword: string): Promise<{ error: { message: string } | null }> {
  const { error } = await this.supabase.client.auth.updateUser({ password: newPassword });
  if (error) return { error };

  const session = await this.getSession();
  if (!session?.user) {
    return { error: { message: 'Your session expired. Please sign in again.' } };
  }

  const { data, error: flagError } = await this.supabase.client
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', session.user.id)
    .select('id');

  if (flagError) return { error: flagError };
  if (!data || data.length === 0) {
    return {
      error: {
        message: 'Your password was changed, but your account could not be updated. Please contact the administrator.'
      }
    };
  }

  return { error: null };
}
}