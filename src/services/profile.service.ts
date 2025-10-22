import { Injectable, signal, effect, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { UserProfile } from '../types/database.types';
import { User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private supabaseService = inject(SupabaseService);
  currentUserProfile = signal<UserProfile | null>(null);

  constructor() {
    effect(() => {
      const user = this.supabaseService.currentUser();
      if (user) {
        this.fetchUserProfile(user);
      } else {
        this.currentUserProfile.set(null);
      }
    });
  }

  async fetchUserProfile(user: User) {
    const { data, error } = await this.supabaseService.client
      .from('users')
      .select('*')
      .eq('uid', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
    } else {
      this.currentUserProfile.set(data as UserProfile);
    }
  }
}
