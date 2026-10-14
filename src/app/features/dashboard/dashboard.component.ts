import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  profile = signal<any>(null);
  loading = signal(true);
  errorMessage = signal('');

  isEditing = signal(false);
  uploadingImage = signal(false);
  editFormData = { full_name: '', avatar_url: '', contact_info: '', program: '' };

  // --- New Signal for the Logout Modal ---
  showLogoutModal = signal(false);

  statuses = ['In Office', 'In Class', 'On Break', 'Out of Office', 'Offline'];

  // --- NEW: dot color for each status (full class names so Tailwind keeps them) ---
  statusDot: Record<string, string> = {
    'In Office': 'bg-emerald-500',
    'In Class': 'bg-sky-500',
    'On Break': 'bg-amber-500',
    'Out of Office': 'bg-rose-500',
    'Offline': 'bg-slate-400',
  };

  today = new Date();

  statusTone: Record<string, string> = {
    'In Office': 'tone-emerald',
    'In Class': 'tone-sky',
    'On Break': 'tone-amber',
    'Out of Office': 'tone-rose',
    'Offline': 'tone-slate',
  };

  statusHint: Record<string, string> = {
    'In Office': "Come by, I'm here",
    'In Class': 'Teaching right now',
    'On Break': 'Back shortly',
    'Out of Office': 'Away from campus',
    'Offline': 'Not reachable',
  };

  programs = [
    { value: 'IT', label: 'Information Technology (IT)' },
    { value: 'EMT', label: 'Electro Mechanical Technology (EMT)' },
    { value: 'TCM', label: 'Technology Communication Management (TCM)' },
  ];

  // A write that matched no rows usually means the account was disabled:
  // end the session. Otherwise just show the message.
  private async handleBlockedWrite(message: string) {
    const access = await this.auth.getAccess();
    if (access && !access.isActive) {
      await this.auth.signOut();
      await this.router.navigate(['/login']);
      return;
    }
    this.errorMessage.set(message);
  }

  // --- NEW: time-of-day greeting for the header ---
  get greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private router: Router,
  ) {}

  async ngOnInit() {
    try {
      const session = await this.auth.getSession();
      if (!session?.user) {
        this.errorMessage.set('You are not signed in.');
        return;
      }

      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Database Error:', error);
        this.errorMessage.set('Profile not found in the database.');
        return;
      }
      this.profile.set(data);
    } catch (err) {
      console.error('Unexpected error:', err);
      this.errorMessage.set('Something went wrong while loading your profile.');
    } finally {
      this.loading.set(false);
    }
  }

  // --- NEW CUSTOM LOGOUT LOGIC ---
  logout() {
    this.showLogoutModal.set(true); // Open the modal
  }

  cancelLogout() {
    this.showLogoutModal.set(false); // Close the modal
  }

  async confirmLogout() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }

  // --- STATUS & EDITING LOGIC ---
  async updateStatus(newStatus: string) {
    const current = this.profile();
    if (!current) return;

    const { data, error } = await this.supabase.client
      .from('profiles')
      .update({ current_status: newStatus })
      .eq('id', current.id)
      .select('id');

    // A blocked update returns no error but also no rows
    if (error || !data || data.length === 0) {
      console.error('Error updating status:', error ?? 'No rows updated');
      await this.handleBlockedWrite('Could not update your status. Please try again.');
      return;
    }

    this.errorMessage.set('');
    this.profile.set({ ...current, current_status: newStatus });
  }

  startEdit() {
    const current = this.profile();
    if (current) {
      this.editFormData = {
        full_name: current.full_name || '',
        avatar_url: current.avatar_url || '',
        contact_info: current.contact_info || '',
        program: current.program || '',
      };
      this.isEditing.set(true);
    }
  }

  cancelEdit() {
    this.isEditing.set(false);
  }

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.uploadingImage.set(true);
    const current = this.profile();

    const fileExt = file.name.split('.').pop();
    const fileName = `${current.id}/${Date.now()}.${fileExt}`;

    const { error } = await this.supabase.client.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image.');
      this.uploadingImage.set(false);
      return;
    }

    const { data: publicUrlData } = this.supabase.client.storage
      .from('avatars')
      .getPublicUrl(fileName);

    this.editFormData.avatar_url = publicUrlData.publicUrl;
    this.uploadingImage.set(false);
  }

  async saveProfile() {
    const current = this.profile();
    if (!current) return;

    const { data, error } = await this.supabase.client
      .from('profiles')
      .update({
        full_name: this.editFormData.full_name,
        avatar_url: this.editFormData.avatar_url,
        contact_info: this.editFormData.contact_info,
        program: this.editFormData.program || null,
      })
      .eq('id', current.id)
      .select('id');

    if (error || !data || data.length === 0) {
      console.error('Error saving profile:', error ?? 'No rows updated');
      await this.handleBlockedWrite('Failed to save profile updates.');
      return;
    }

    this.profile.set({
      ...current,
      full_name: this.editFormData.full_name,
      avatar_url: this.editFormData.avatar_url,
      contact_info: this.editFormData.contact_info,
      program: this.editFormData.program || null,
    });
    this.isEditing.set(false);
  }
}
