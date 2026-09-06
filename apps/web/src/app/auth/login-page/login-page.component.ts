import { Component, ElementRef, Signal, effect, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  email = '';
  password = '';
  errorMessage = signal<string | null>(null);
  submitting = signal(false);
  resendState = signal<'idle' | 'sending' | 'sent'>('idle');
  /** Surfaces AuthService.authError (a failed Google sign-in) next to the
   * button -- previously that failure was completely silent. */
  googleError!: Signal<string | null>;

  /** Signal-based query, not @ViewChild + ngAfterViewInit -- same reasoning
   * as everywhere else this pattern shows up in this codebase: the button
   * always exists here (this page has no conditional branches hiding it),
   * but the effect still needs window.google to have finished loading its
   * script, which can happen after this component's own first render. */
  private googleButtonContainer = viewChild<ElementRef<HTMLElement>>('googleButtonContainer');

  constructor(
    private auth: AuthService,
    private router: Router,
    route: ActivatedRoute,
  ) {
    this.googleError = this.auth.authError;

    effect(() => {
      const el = this.googleButtonContainer();
      if (el) this.auth.renderGoogleButton(el.nativeElement);
    });

    // Arrives here from GET /auth/verify's error redirect when a
    // verification link was missing/expired/already used.
    const error = route.snapshot.queryParamMap.get('error');
    if (error === 'expired') {
      this.errorMessage.set('That verification link expired or was already used. Log in, or sign up again.');
    }
  }

  submit() {
    if (!this.email || !this.password) return;
    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl('/');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message ?? 'Something went wrong. Try again.');
      },
    });
  }

  resendVerification() {
    if (!this.email) return;
    this.resendState.set('sending');
    this.auth.resendVerification(this.email).subscribe({
      next: () => this.resendState.set('sent'),
      error: () => this.resendState.set('sent'), // same generic outcome either way, by design
    });
  }

  get showResend(): boolean {
    return this.errorMessage()?.toLowerCase().includes('verify your email') ?? false;
  }
}
