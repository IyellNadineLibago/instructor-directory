import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Instructor dashboard: instructors only
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const access = await auth.getAccess();
  if (!access) return router.createUrlTree(['/login']);

  if (!access.isActive) {
    await auth.signOut();
    return router.createUrlTree(['/login']);
  }
  if (access.mustChangePassword) return router.createUrlTree(['/change-password']);
  if (access.role !== 'instructor') return router.createUrlTree(['/admin']);

  return true;
};

// Admin portal: admins only
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const access = await auth.getAccess();
  if (!access) return router.createUrlTree(['/login']);

  if (!access.isActive) {
    await auth.signOut();
    return router.createUrlTree(['/login']);
  }
  if (access.mustChangePassword) return router.createUrlTree(['/change-password']);
  if (access.role !== 'admin') return router.createUrlTree(['/dashboard']);

  return true;
};

// Forced password change page: only for signed-in users who still must change it
export const passwordChangeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const access = await auth.getAccess();
  if (!access) return router.createUrlTree(['/login']);

  if (!access.isActive) {
    await auth.signOut();
    return router.createUrlTree(['/login']);
  }
  if (!access.mustChangePassword) return router.createUrlTree([auth.routeFor(access)]);

  return true;
};