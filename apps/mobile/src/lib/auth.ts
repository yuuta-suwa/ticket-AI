import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthSession { userId: string; email: string | null }
/** Abstraction so Apple / Google sign-in can be added later without touching screens. */
export interface AuthProvider {
  readonly name: string;
  getSession(): Promise<AuthSession | null>;
  onChange(cb: (s: AuthSession | null) => void): () => void;
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export class SupabaseAuthProvider implements AuthProvider {
  readonly name = 'supabase';
  constructor(private readonly sb: SupabaseClient) {}
  private map(u: { id: string; email?: string | null } | null | undefined): AuthSession | null { return u ? { userId: u.id, email: u.email ?? null } : null; }
  async getSession() { const { data } = await this.sb.auth.getSession(); return this.map(data.session?.user); }
  onChange(cb: (s: AuthSession | null) => void) { const { data } = this.sb.auth.onAuthStateChange((_e, s) => cb(this.map(s?.user))); return () => data.subscription.unsubscribe(); }
  async sendEmailCode(email: string) { const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }); if (error) throw error; }
  async verifyEmailCode(email: string, code: string) { const { error } = await this.sb.auth.verifyOtp({ email, token: code, type: 'email' }); if (error) throw error; }
  async signInWithPassword(email: string, password: string) { const { error } = await this.sb.auth.signInWithPassword({ email, password }); if (error) throw error; }
  async signOut() { await this.sb.auth.signOut(); }
}

/** Demo/review-safe auth: any email, code 000000. Only constructed when ENV.demoMode (never in production builds). */
export class DemoAuthProvider implements AuthProvider {
  readonly name = 'demo';
  private session: AuthSession | null = null; private cbs = new Set<(s: AuthSession | null) => void>();
  private set(s: AuthSession | null) { this.session = s; this.cbs.forEach((c) => c(s)); }
  async getSession() { return this.session; }
  onChange(cb: (s: AuthSession | null) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  async sendEmailCode() {}
  async verifyEmailCode(email: string, code: string) { if (code !== '000000') throw new Error('Invalid code'); this.set({ userId: 'demo-user', email }); }
  async signInWithPassword(email: string) { this.set({ userId: 'demo-user', email }); }
  async signOut() { this.set(null); }
}
