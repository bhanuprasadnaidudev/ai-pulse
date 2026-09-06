import { Component, ElementRef, Signal, effect, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup-page.component.html',
  styleUrl: './signup-page.component.scss',
})
export class SignupPageComponent {
  name = '';
  email = '';
  password = '';
  confirmPassword = '';

  errorMessage = signal<string | null>(null);
  submitting = signal(false);
  /** Signup's success state swaps the form for a "check your email"
   * message in place, rather than navigating away -- there's nowhere
   * meaningful to navigate to yet, since the account isn't usable until
   * the link in that email is clicked. */
  submitted = signal(false);
  /** Surfaces AuthService.authError (a failed Google sign-in) next to the
   * button -- previously that failure was completely silent. */
  googleError!: Signal<string | null>;

  private googleButtonContainer = viewChild<ElementRef<HTMLElement>>('googleButtonContainer');

  constructor(private auth: AuthService) {
    this.googleError = this.auth.authError;

    effect(() => {
      const el = this.googleButtonContainer();
      if (el) this.auth.renderGoogleButton(el.nativeElement);
    });
  }

  get passwordTooShort(): boolean {
    return this.password.length > 0 && this.password.length < MIN_PASSWORD_LENGTH;
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.password !== this.confirmPassword;
  }

  submit() {
    if (!this.name || !this.email || !this.password) return;
    if (this.passwordTooShort || this.passwordsMismatch) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth.signup(this.name, this.email, this.password, this.confirmPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Something went wrong. Try again.');
      },
    });
  }
}
