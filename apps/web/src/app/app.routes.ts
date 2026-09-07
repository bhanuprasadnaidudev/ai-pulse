import { Routes } from '@angular/router';
import { LoginPageComponent } from './auth/login-page/login-page.component';
import { SignupPageComponent } from './auth/signup-page/signup-page.component';
import { CompleteProfilePageComponent } from './auth/complete-profile-page/complete-profile-page.component';
import { AccountPageComponent } from './auth/account-page/account-page.component';
import { ForgotPasswordPageComponent } from './auth/forgot-password-page/forgot-password-page.component';
import { ResetPasswordPageComponent } from './auth/reset-password-page/reset-password-page.component';

// login/signup/complete-profile are shell-hidden, full-page routes --
// App's <router-outlet> renders whichever of these is active. Crucially,
// that outlet only exists in App's template inside the branch for those
// three routes (see app.html's top-level @if/@else if chain) -- it is
// never present in the DOM while any other route is active.
//
// "account" needs a component here (Angular's router rejects a route with
// none), but AccountPageComponent is never actually activated through
// this route -- App's template swaps it into .content directly instead
// (the same manual pattern FeedComponent already uses, so it renders
// *with* the sidebar). Since the router-outlet doesn't exist anywhere in
// the tree while on /account, there is nothing for this entry to activate
// into; it exists purely so routerLink="/account" and
// router.navigateByUrl('/account') resolve to a real route instead of
// erroring.
export const routes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: 'signup', component: SignupPageComponent },
  { path: 'complete-profile', component: CompleteProfilePageComponent },
  { path: 'forgot-password', component: ForgotPasswordPageComponent },
  { path: 'reset-password', component: ResetPasswordPageComponent },
  { path: 'account', component: AccountPageComponent },
];
