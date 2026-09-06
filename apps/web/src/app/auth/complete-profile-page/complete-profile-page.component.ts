import { Component, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';

const MIN_PASSWORD_LENGTH = 8;

/** Forced after a *first* Google sign-in (AuthUser.needsPassword) -- App's
 * redirect effect sends any signed-in user here until they set a password,
 * regardless of which page they arrived from, so a closed tab mid-setup
 * just picks back up here next visit rather than silently skipping it. */
@Component({
  selector: 'app-complete-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './complete-profile-page.component.html',
  styleUrl: './complete-profile-page.component.scss',
})
export class CompleteProfilePageComponent {
  name = '';
  password = '';
  confirmPassword = '';

  errorMessage = signal<string | null>(null);
  submitting = signal(false);

  constructor(private auth: AuthService) {
    // Pre-fill from whatever Google supplied -- editable, not just shown,
    // since this doubles as "confirm your name" per the request.
    effect(() => {
      const user = this.auth.currentUser();
      if (user && !this.name) this.name = user.name;
    });
  }

  get passwordTooShort(): boolean {
    return this.password.length > 0 && this.password.length < MIN_PASSWORD_LENGTH;
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.password !== this.confirmPassword;
  }

  submit() {
    if (!this.name || !this.password) return;
    if (this.passwordTooShort || this.passwordsMismatch) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth.setPassword(this.name, this.password, this.confirmPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        // No explicit navigate -- currentUser().needsPassword is now
        // false, and App's redirect effect takes it from here.
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Something went wrong. Try again.');
      },
    });
  }

  signOut() {
    this.auth.logout();
  }
}
