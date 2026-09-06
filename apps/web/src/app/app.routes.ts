import { Routes } from '@angular/router';
import { LoginPageComponent } from './auth/login-page/login-page.component';
import { SignupPageComponent } from './auth/signup-page/signup-page.component';
import { AccountPageComponent } from './auth/account-page/account-page.component';

export const routes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: 'signup', component: SignupPageComponent },
  { path: 'account', component: AccountPageComponent },
];
