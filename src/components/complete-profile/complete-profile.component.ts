import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ProfileService } from '../../services/profile.service';
import { UserProfile } from '../../types/database.types';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './complete-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompleteProfileComponent {
  private supabaseService = inject(SupabaseService);
  profileService = inject(ProfileService);

  loading = signal(false);
  errorMessage = signal<string | null>(null);

  // Form state
  avatarFile: File | null = null;
  avatarPreviewUrl = signal<string | null>(null);
  username = signal('');
  displayName = signal('');
  bio = signal('');

  profile = this.profileService.currentUserProfile;

  constructor() {
    effect(() => {
      // Pre-fill form when profile data loads
      const currentProfile = this.profile();
      if (currentProfile) {
        this.username.set(currentProfile.username || '');
        this.displayName.set(currentProfile.display_name || '');
        const bio = currentProfile.bio === '__SYNAPSE_PROFILE_NEEDS_COMPLETION__' ? '' : currentProfile.bio;
        this.bio.set(bio || '');
        this.avatarPreviewUrl.set(currentProfile.avatar || null);
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.avatarFile = input.files[0];
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.avatarPreviewUrl.set(e.target.result);
      };
      reader.readAsDataURL(this.avatarFile);
    }
  }

  async saveProfile() {
    this.loading.set(true);
    this.errorMessage.set(null);
    const currentUser = this.profile();
    if (!currentUser) {
      this.errorMessage.set('User not found.');
      this.loading.set(false);
      return;
    }
    
    try {
      let avatarUrl = currentUser.avatar;
      if (this.avatarFile) {
        avatarUrl = await this.supabaseService.uploadAvatar(this.avatarFile);
      }

      const updates: Partial<UserProfile> = {
        username: this.username(),
        display_name: this.displayName(),
        bio: this.bio(),
        avatar: avatarUrl,
      };

      const updatedProfile = await this.supabaseService.updateProfile(updates);
      
      this.profileService.currentUserProfile.set(updatedProfile);

      // Signal that profile is complete
      this.supabaseService.profileNeedsCompletion.set(false);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to update profile.');
    } finally {
      this.loading.set(false);
    }
  }
  
  async signOut() {
    await this.supabaseService.signOut();
  }
}
