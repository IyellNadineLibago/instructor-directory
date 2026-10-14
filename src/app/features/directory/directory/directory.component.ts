import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-directory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './directory.component.html'
})
export class DirectoryComponent implements OnInit, OnDestroy {
  instructors = signal<any[]>([]);
  loading = signal(true);
  errorMessage = signal('');
  isSignedIn = signal(false);

  searchTerm = signal('');
  selectedProgram = signal('ALL');
  selectedId = signal<string | null>(null);

  programs = [
    { value: 'ALL', label: 'All' },
    { value: 'IT', label: 'IT' },
    { value: 'EMT', label: 'EMT' },
    { value: 'TCM', label: 'TCM' },
  ];

  programNames: Record<string, string> = {
    IT: 'Information Technology',
    EMT: 'Electro Mechanical Technology',
    TCM: 'Technology Communication Management',
  };

  statusDot: Record<string, string> = {
    'In Office': 'bg-emerald-500',
    'In Class': 'bg-sky-500',
    'On Break': 'bg-amber-500',
    'Out of Office': 'bg-rose-500',
    'Offline': 'bg-slate-400',
  };

  statusHint: Record<string, string> = {
    'In Office': "Come by, I'm here",
    'In Class': 'Teaching right now',
    'On Break': 'Back shortly',
    'Out of Office': 'Away from campus',
    'Offline': 'Not reachable',
  };

  // Search + program filter, recalculated automatically
  filtered = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const prog = this.selectedProgram();
    return this.instructors().filter(i =>
      (prog === 'ALL' || i.program === prog) &&
      (!term || i.full_name.toLowerCase().includes(term))
    );
  });

  // The instructor shown in the pop-up (stays live when their status changes)
  selected = computed(() =>
    this.instructors().find(i => i.id === this.selectedId()) ?? null
  );

  counts = computed(() => {
    const list = this.instructors();
    const result: Record<string, number> = { ALL: list.length, IT: 0, EMT: 0, TCM: 0 };
    for (const i of list) {
      if (i.program && result[i.program] !== undefined) result[i.program]++;
    }
    return result;
  });

  private channel?: RealtimeChannel;

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService
  ) {}

  async ngOnInit() {
  // Used only to switch the header link between "Instructor login" and "Go to dashboard"
  this.auth.getSession()
    .then(session => this.isSignedIn.set(!!session))
    .catch(() => {});

  try {
    const { data, error } = await this.supabase.client
  .from('profiles')
  .select('id, full_name, avatar_url, contact_info, program, current_status, is_active')
  .eq('role', 'instructor')
  .eq('is_active', true)
  .order('full_name');

    if (error) {
      console.error('Directory load error:', error);
      this.errorMessage.set('Could not load the directory. Please try again later.');
      return;
    }

    this.instructors.set(data ?? []);
  } catch (err) {
    console.error('Unexpected error:', err);
    this.errorMessage.set('Something went wrong while loading the directory.');
    return;
  } finally {
    this.loading.set(false);
  }

  // Live updates are a bonus: if they fail, the directory still works
  this.listenForChanges();
}

// Live updates: when an instructor changes status/profile, the page updates itself
private listenForChanges() {
  try {
    // Clean up any previous channel from this component
    if (this.channel) {
      this.supabase.client.removeChannel(this.channel);
    }

    // Unique name, so a leftover subscribed channel is never reused
    this.channel = this.supabase.client
      .channel(`directory-profiles-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: any) => {
          const row = payload.new;
          this.instructors.update(list =>
  list
    .map(i => (i.id === row.id ? { ...i, ...row } : i))
    .filter(i => i.is_active !== false)
);
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Live updates unavailable:', err);
  }
}
  openProfile(id: string) {
    this.selectedId.set(id);
  }

  @HostListener('document:keydown.escape')
  closeProfile() {
    this.selectedId.set(null);
  }

  clearFilters() {
    this.searchTerm.set('');
    this.selectedProgram.set('ALL');
  }

  ngOnDestroy() {
    if (this.channel) this.supabase.client.removeChannel(this.channel);
  }
}