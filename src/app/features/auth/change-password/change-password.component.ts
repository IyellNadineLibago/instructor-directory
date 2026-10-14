import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './change-password.component.html'
})
export class ChangePasswordComponent {
  newPassword = '';
  confirmPassword = '';
  errorMessage = signal('');
  isSaving = signal(false);

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  get canSubmit(): boolean {
    return this.newPassword.length >= 8 && this.newPassword === this.confirmPassword;
  }

  async onSubmit() {
    if (!this.canSubmit) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    try {
      const { error } = await this.auth.changePassword(this.newPassword);

      if (error) {
        console.error('Password change error:', error);
        this.errorMessage.set(error.message);
        this.isSaving.set(false);
        return;
      }

      const access = await this.auth.getAccess();
      await this.router.navigate([access ? this.auth.routeFor(access) : '/login']);
    } catch (err) {
      console.error('Unexpected error:', err);
      this.errorMessage.set('Something went wrong. Please try again.');
      this.isSaving.set(false);
    }
  }

  async signOut() {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
