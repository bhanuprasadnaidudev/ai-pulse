import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';

const MIN_PASSWORD_LENGTH = 8;

/** Step two: arrived at from the emailed link, which carries the token as
 * a query param. On success the API signs them in, so there's no navigate
 * here -- App's redirect effect sees currentUser appear and takes over. */
@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password-page.component.html',
  styleUrl: './reset-password-page.component.scss',
})
export class ResetPasswordPageComponent {
  password = '';
  confirmPassword = '';
  errorMessage = signal<string | null>(null);
  submitting = signal(false);

  private readonly token: string;

  constructor(
    private auth: AuthService,
    route: ActivatedRoute,
  ) {
    this.token = route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.errorMessage.set('That link is missing its reset code. Request a new one.');
    }
  }

  get hasToken(): boolean {
    return !!this.token;
  }

  get passwordTooShort(): boolean {
    return this.password.length > 0 && this.password.length < MIN_PASSWORD_LENGTH;
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.password !== this.confirmPassword;
  }

  submit() {
    if (!this.password || this.passwordTooShort || this.passwordsMismatch) return;
    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth.resetPassword(this.token, this.password, this.confirmPassword).subscribe({
      next: () => this.submitting.set(false),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Could not reset your password. Request a new link.');
      },
    });
  }
}
