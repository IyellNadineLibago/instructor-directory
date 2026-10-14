import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

// The deployed function's address. If you ever rename it, change it here only.
const FUNCTION_NAME = 'clever-responder';

// Must match the rule inside the function
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

type StatusFilter = 'all' | 'active' | 'disabled' | 'incomplete';

interface Instructor {
  id: string;
  full_name: string;
  program: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  username: string;
  created_at: string | null;
  last_sign_in_at: string | null;
}

interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  run: () => Promise<string | null>; // returns an error message, or null on success
}

interface Credentials {
  username: string;
  fullName: string;
  tempPassword: string;
  kind: 'created' | 'reset';
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html'
})
export class AdminComponent implements OnInit {
  instructors = signal<Instructor[]>([]);
  loading = signal(true);
  errorMessage = signal('');

  searchTerm = signal('');
  statusFilter = signal<StatusFilter>('all');

  filters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'disabled', label: 'Disabled' },
    { value: 'incomplete', label: 'Incomplete' },
  ];

  programs = [
    { value: 'IT', label: 'Information Technology (IT)' },
    { value: 'EMT', label: 'Electro Mechanical Technology (EMT)' },
    { value: 'TCM', label: 'Technology Communication Management (TCM)' },
  ];

  // Dialog state
  busy = signal(false);
  modalError = signal('');

  showCreate = signal(false);
  newFullName = signal('');
  newUsername = signal('');
  newProgram = signal('');

  editTarget = signal<Instructor | null>(null);
  editName = signal('');
  editProgram = signal('');

  confirm = signal<ConfirmDialog | null>(null);

  credentials = signal<Credentials | null>(null);
  copied = signal(false);
  copyFailed = signal(false);

  // Derived values
  filtered = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const filter = this.statusFilter();

    return this.instructors().filter(i => {
      const matchesTerm =
        !term ||
        i.full_name.toLowerCase().includes(term) ||
        i.username.toLowerCase().includes(term);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && i.is_active) ||
        (filter === 'disabled' && !i.is_active) ||
        (filter === 'incomplete' && (!i.program || !i.avatar_url));

      return matchesTerm && matchesFilter;
    });
  });

  counts = computed(() => {
    const list = this.instructors();
    return {
      all: list.length,
      active: list.filter(i => i.is_active).length,
      disabled: list.filter(i => !i.is_active).length,
      incomplete: list.filter(i => !i.program || !i.avatar_url).length,
    };
  });

  usernameValid = computed(() => USERNAME_PATTERN.test(this.newUsername()));

  canCreate = computed(
    () =>
      this.usernameValid() &&
      this.newFullName().trim().length >= 2 &&
      this.programs.some(p => p.value === this.newProgram())
  );

  canSaveEdit = computed(
    () =>
      this.editName().trim().length >= 2 &&
      this.programs.some(p => p.value === this.editProgram())
  );

  constructor(
    private auth: AuthService,
    private supabase: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.load();
  }

  // Talks to the secure Edge Function and turns failures into readable messages
  private async call<T = any>(
    body: Record<string, unknown>
  ): Promise<{ data: T | null; error: string | null }> {
    try {
      const { data, error } = await this.supabase.client.functions.invoke(FUNCTION_NAME, { body });

      if (error) {
        let message = 'Request failed. Please try again.';
        try {
          const details = await (error as any).context.json();
          if (details?.error) message = details.error;
        } catch {}
        return { data: null, error: message };
      }

      return { data: data as T, error: null };
    } catch (err) {
      console.error('Function call failed:', err);
      return { data: null, error: 'Network error. Please try again.' };
    }
  }

  async load(silent = false) {
    if (!silent) this.loading.set(true);
    this.errorMessage.set('');

    const { data, error } = await this.call<{ instructors: Instructor[] }>({ action: 'list' });

    if (error || !data) {
      this.errorMessage.set(error ?? 'Could not load instructor accounts.');
    } else {
      this.instructors.set(data.instructors);
    }
    this.loading.set(false);
  }

  // ---------- Add instructor ----------

  openCreate() {
    this.newFullName.set('');
    this.newUsername.set('');
    this.newProgram.set('');
    this.modalError.set('');
    this.showCreate.set(true);
  }

  closeCreate() {
    if (this.busy()) return;
    this.showCreate.set(false);
  }

  onUsernameInput(value: string) {
    this.newUsername.set(value.toLowerCase().replace(/\s/g, ''));
  }

  // Fills a suggested username (first initial + last name) once the name is typed
  suggestUsername() {
    if (this.newUsername() || !this.newFullName().trim()) return;

    const parts = this.newFullName().toLowerCase().split(/\s+/).filter(Boolean);
    const raw = parts.length > 1 ? parts[0][0] + parts.slice(1).join('') : parts[0];
    this.newUsername.set(raw.replace(/[^a-z0-9._-]/g, '').slice(0, 30));
  }

  async createInstructor() {
    if (!this.canCreate() || this.busy()) return;

    this.busy.set(true);
    this.modalError.set('');

    const { data, error } = await this.call<{
      username: string;
      full_name: string;
      temp_password: string;
    }>({
      action: 'create',
      username: this.newUsername(),
      full_name: this.newFullName().trim(),
      program: this.newProgram(),
    });

    this.busy.set(false);

    if (error || !data) {
      this.modalError.set(error ?? 'Could not create the account.');
      return;
    }

    this.showCreate.set(false);
    this.credentials.set({
      username: data.username,
      fullName: data.full_name,
      tempPassword: data.temp_password,
      kind: 'created',
    });
    this.load(true); // refresh the list in the background
  }

  // ---------- Edit name / program ----------

  openEdit(i: Instructor) {
    this.editTarget.set(i);
    this.editName.set(i.full_name);
    this.editProgram.set(i.program ?? '');
    this.modalError.set('');
  }

  closeEdit() {
    if (this.busy()) return;
    this.editTarget.set(null);
  }

  async saveEdit() {
    const target = this.editTarget();
    if (!target || !this.canSaveEdit() || this.busy()) return;

    this.busy.set(true);
    this.modalError.set('');

    const fullName = this.editName().trim();
    const program = this.editProgram();

    const { error } = await this.call({
      action: 'update_profile',
      user_id: target.id,
      full_name: fullName,
      program,
    });

    this.busy.set(false);

    if (error) {
      this.modalError.set(error);
      return;
    }

    this.instructors.update(list =>
      list
        .map(x => (x.id === target.id ? { ...x, full_name: fullName, program } : x))
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
    );
    this.editTarget.set(null);
  }

  // ---------- Confirmed actions ----------

  askResetPassword(i: Instructor) {
    this.modalError.set('');
    this.confirm.set({
      title: 'Reset password?',
      message: `A new temporary password will be generated for ${i.full_name}. Their current password will stop working, and they will have to choose a new one when they sign in.`,
      confirmLabel: 'Reset password',
      danger: false,
      run: async () => {
        const { data, error } = await this.call<{ temp_password: string }>({
          action: 'reset_password',
          user_id: i.id,
        });
        if (error || !data) return error ?? 'Could not reset the password.';

        this.instructors.update(list =>
          list.map(x => (x.id === i.id ? { ...x, must_change_password: true } : x))
        );
        this.credentials.set({
          username: i.username,
          fullName: i.full_name,
          tempPassword: data.temp_password,
          kind: 'reset',
        });
        return null;
      },
    });
  }

  askToggleActive(i: Instructor) {
    const activate = !i.is_active;
    this.modalError.set('');
    this.confirm.set({
      title: activate ? 'Re-enable this account?' : 'Disable this account?',
      message: activate
        ? `${i.full_name} will be able to sign in again and will reappear in the public directory.`
        : `${i.full_name} will not be able to sign in and will be hidden from the public directory. You can re-enable the account at any time.`,
      confirmLabel: activate ? 'Re-enable account' : 'Disable account',
      danger: !activate,
      run: async () => {
        const { error } = await this.call({
          action: 'set_active',
          user_id: i.id,
          active: activate,
        });
        if (error) return error;

        this.instructors.update(list =>
          list.map(x => (x.id === i.id ? { ...x, is_active: activate } : x))
        );
        return null;
      },
    });
  }

  async runConfirm() {
    const dialog = this.confirm();
    if (!dialog || this.busy()) return;

    this.busy.set(true);
    this.modalError.set('');

    const error = await dialog.run();

    this.busy.set(false);

    if (error) {
      this.modalError.set(error);
      return;
    }
    this.confirm.set(null);
  }

  cancelConfirm() {
    if (this.busy()) return;
    this.confirm.set(null);
  }

  // ---------- Temporary password dialog ----------

  async copyCredentials() {
    const c = this.credentials();
    if (!c) return;

    const text = `FacultyPoint login\nUsername: ${c.username}\nTemporary password: ${c.tempPassword}`;

    try {
      await navigator.clipboard.writeText(text);
      this.copyFailed.set(false);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
      this.copyFailed.set(true);
    }
  }

  closeCredentials() {
    this.credentials.set(null);
    this.copied.set(false);
    this.copyFailed.set(false);
  }

  // ---------- Other ----------

  // The temporary-password dialog is deliberately not closed by Escape
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.busy()) return;
    this.showCreate.set(false);
    this.editTarget.set(null);
    this.confirm.set(null);
  }

  async logout() {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}