import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  errorMessage = signal('');
  isLoading = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  // Already signed in? Skip the form and go where this person belongs
  async ngOnInit() {
    try {
      const access = await this.authService.getAccess();
      if (access?.isActive) {
        await this.router.navigate([this.authService.routeFor(access)]);
      }
    } catch (err) {
      console.error('Session check failed:', err);
    }
  }

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const { username, password } = this.loginForm.value;
      const { error } = await this.authService.signIn(username, password);

      if (error) {
        console.error('Sign-in error:', error);
        if (/banned/i.test(error.message)) {
          this.errorMessage.set('This account has been disabled. Please contact the administrator.');
        } else if (error.status === 400) {
          this.errorMessage.set('Invalid username or password.');
        } else {
          this.errorMessage.set(`Sign-in failed: ${error.message}`);
        }
        this.isLoading.set(false);
        return;
      }

      const access = await this.authService.getAccess();

      if (!access) {
        await this.authService.signOut();
        this.errorMessage.set('This account has no profile. Please contact the administrator.');
        this.isLoading.set(false);
        return;
      }

      if (!access.isActive) {
        await this.authService.signOut();
        this.errorMessage.set('This account has been disabled. Please contact the administrator.');
        this.isLoading.set(false);
        return;
      }

      await this.router.navigate([this.authService.routeFor(access)]);
    } catch (err) {
      console.error('Unexpected error:', err);
      this.errorMessage.set('A network error occurred. Please try again.');
      this.isLoading.set(false);
    }
  }
}