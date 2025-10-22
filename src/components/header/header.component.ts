import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { ProfileService } from '../../services/profile.service';
import { ThemeService } from '../../services/theme.service';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  supabaseService = inject(SupabaseService);
  profileService = inject(ProfileService);
  themeService = inject(ThemeService);
  navigationService = inject(NavigationService);

  isDropdownOpen = signal(false);

  currentUserProfile = this.profileService.currentUserProfile;
  currentTheme = this.themeService.theme;

  toggleDropdown() {
    this.isDropdownOpen.update(v => !v);
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  navigateToProfile() {
    this.isDropdownOpen.set(false);
    this.navigationService.navigateTo('profile');
  }

  navigateToChat() {
    this.isDropdownOpen.set(false);
    this.navigationService.navigateTo('chat');
  }
  
  navigateToHome() {
    this.navigationService.navigateTo('home');
  }

  signOut() {
    this.isDropdownOpen.set(false);
    this.supabaseService.signOut();
  }
}
