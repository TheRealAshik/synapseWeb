import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div class="w-full max-w-md p-8 space-y-8 bg-card rounded-lg shadow-md">
        <div>
          <h2 class="mt-6 text-center text-3xl font-extrabold text-foreground">
            @if (authMode() === 'signIn') {
              Sign in to your account
            } @else {
              Create a new account
            }
          </h2>
        </div>
        <form class="mt-8 space-y-6" (submit)="handleAuth($event)">
          <div class="rounded-md shadow-sm -space-y-px">
            @if (authMode() === 'signUp') {
              <div>
                <label for="username" class="sr-only">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  [disabled]="loading()"
                  [(ngModel)]="username"
                  class="appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground bg-input rounded-t-md focus:outline-none focus:ring-2 focus:ring-ring focus:z-10 sm:text-sm"
                  placeholder="Username"
                />
              </div>
            }
            <div>
              <label for="email-address" class="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autocomplete="email"
                required
                [disabled]="loading()"
                [(ngModel)]="email"
                [class]="'appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:z-10 sm:text-sm ' + (authMode() === 'signUp' ? '' : 'rounded-t-md')"
                placeholder="Email address"
              />
            </div>
            <div>
              <label for="password" class="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                [disabled]="loading()"
                [(ngModel)]="password"
                class="appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground bg-input rounded-b-md focus:outline-none focus:ring-2 focus:ring-ring focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          @if (errorMessage()) {
            <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
          }

          <div>
            <button
              type="submit"
              [disabled]="loading()"
              class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="absolute left-0 inset-y-0 flex items-center pl-3">
                @if (loading()) {
                  <svg class="animate-spin h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                }
              </span>
              @if (authMode() === 'signIn') {
                Sign In
              } @else {
                Sign Up
              }
            </button>
          </div>

          @if (authMode() === 'signIn') {
            <div>
              <button
                type="button"
                (click)="handleDevLogin()"
                [disabled]="loading()"
                class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Login as Dev
              </button>
            </div>
          }
        </form>
        <div class="text-sm text-center">
          <a href="#" (click)="$event.preventDefault(); toggleMode()" class="font-medium text-primary hover:text-primary/90">
            @if (authMode() === 'signIn') {
              Don't have an account? Sign Up
            } @else {
              Already have an account? Sign In
            }
          </a>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthComponent {
  supabaseService = inject(SupabaseService);

  loading = signal(false);
  authMode = signal<'signIn' | 'signUp'>('signIn');
  email = signal('');
  password = signal('');
  username = signal(''); // for sign up
  errorMessage = signal<string | null>(null);

  toggleMode() {
    this.authMode.update(mode => (mode === 'signIn' ? 'signUp' : 'signIn'));
    this.errorMessage.set(null);
    this.email.set('');
    this.password.set('');
    this.username.set('');
  }

  async handleAuth(event: Event) {
    event.preventDefault();
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      let response;
      if (this.authMode() === 'signIn') {
        response = await this.supabaseService.signInWithEmail(this.email(), this.password());
      } else {
        response = await this.supabaseService.signUpWithEmail(this.email(), this.password(), this.username());
      }

      if (response.error) {
        throw response.error;
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'An unexpected error occurred.');
    } finally {
      this.loading.set(false);
    }
  }

  async handleDevLogin() {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.supabaseService.signInWithEmail('mashikahamed0@gmail.com', 'Ashik2006');
      if (response.error) {
        throw response.error;
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'An unexpected error occurred.');
    } finally {
      this.loading.set(false);
    }
  }
}