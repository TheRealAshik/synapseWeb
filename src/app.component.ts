import { ChangeDetectionStrategy, Component, inject, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '@supabase/supabase-js';

import { SupabaseService } from './services/supabase.service';
import { NavigationService } from './services/navigation.service';
import { AuthComponent } from './components/auth/auth.component';
import { HomeComponent } from './components/home/home.component';
import { ProfileComponent } from './components/profile/profile.component';
import { CompleteProfileComponent } from './components/complete-profile/complete-profile.component';
import { ChatComponent } from './components/chat/chat.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, AuthComponent, HomeComponent, ProfileComponent, CompleteProfileComponent, ChatComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private supabaseService = inject(SupabaseService);
  private navigationService = inject(NavigationService);
  
  currentUser: Signal<User | null>;
  activeView: Signal<'home' | 'profile' | 'chat'>;
  profileNeedsCompletion: Signal<boolean>;

  constructor() {
    this.currentUser = this.supabaseService.currentUser;
    this.activeView = this.navigationService.activeView;
    this.profileNeedsCompletion = this.supabaseService.profileNeedsCompletion;
  }
}
