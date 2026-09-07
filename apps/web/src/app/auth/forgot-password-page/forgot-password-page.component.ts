import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

/** Step one of password recovery. Deliberately shows the same confirmation
 * whether or not the address has an account -- the API answers identically
 * for the same anti-enumeration reason, and a UI that distinguished them
 * would leak exactly what the API is careful not to. */
@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password-page.component.html',
  styleUrl: './forgot-password-page.component.scss',
})
export class ForgotPasswordPageComponent {
  email = '';
  submitting = signal(false);
  sent = signal(false);

  constructor(private auth: AuthService) {}

  submit() {
    if (!this.email || this.submitting()) return;
    this.submitting.set(true);
    this.auth.forgotPassword(this.email).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sent.set(true);
      },
      // Same outcome either way, by design.
      error: () => {
        this.submitting.set(false);
        this.sent.set(true);
      },
    });
  }
}
