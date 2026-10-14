import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { authGuard, adminGuard, passwordChangeGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  // Students land here, no login needed
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/directory/directory/directory.component').then(m => m.DirectoryComponent)
  },
  { path: 'login', component: LoginComponent },
  {
    path: 'change-password',
    loadComponent: () =>
      import('./features/auth/change-password/change-password.component').then(m => m.ChangePasswordComponent),
    canActivate: [passwordChangeGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin.component').then(m => m.AdminComponent),
    canActivate: [adminGuard]
  },
  // Unknown URLs go to the public directory
  { path: '**', redirectTo: '' }
];