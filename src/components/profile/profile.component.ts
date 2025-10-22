import { ChangeDetectionStrategy, Component, inject, signal, WritableSignal, ChangeDetectorRef, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User } from '@supabase/supabase-js';

import { SupabaseService } from '../../services/supabase.service';
import { ProfileService } from '../../services/profile.service';
import { UserProfile } from '../../types/database.types';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  private supabaseService = inject(SupabaseService);
  profileService = inject(ProfileService);
  private cdr = inject(ChangeDetectorRef);

  isEditing = signal(false);
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
      // Pre-fill form when profile data loads and we are in edit mode
      if (this.profile() && this.isEditing()) {
        this.setFormFields(this.profile());
      }
    });
  }
  
  startEditing() {
    const currentProfile = this.profile();
    if (currentProfile) {
      this.setFormFields(currentProfile);
      this.isEditing.set(true);
    }
  }
  
  private setFormFields(profile: UserProfile | null) {
      this.username.set(profile?.username || '');
      this.displayName.set(profile?.display_name || '');
      this.bio.set(profile?.bio || '');
      this.avatarPreviewUrl.set(profile?.avatar || null);
  }

  cancelEditing() {
    this.isEditing.set(false);
    this.avatarFile = null;
    this.avatarPreviewUrl.set(null);
    this.errorMessage.set(null);
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
      
      // Manually update signal to reflect changes immediately
      this.profileService.currentUserProfile.set(updatedProfile);

      this.isEditing.set(false);
      this.avatarFile = null;
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to update profile.');
    } finally {
      this.loading.set(false);
    }
  }
}
