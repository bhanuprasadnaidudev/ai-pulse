// Minimal ambient types for the bits of Google Identity Services (loaded
// via the <script> tag in index.html, not an npm package) this app
// actually uses. Not a full typing of Google's API surface -- just enough
// for initialize/renderButton and the credential callback's shape.
// Reference: https://developers.google.com/identity/gsi/web/reference/js-reference
export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleAccountsId {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(
    parent: HTMLElement,
    options?: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black' | 'outline_dark';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}
