import { ChangeDetectionStrategy, Component, inject, signal, WritableSignal, ChangeDetectorRef, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User, RealtimeChannel } from '@supabase/supabase-js';

import { SupabaseService } from '../../services/supabase.service';
import { ProfileService } from '../../services/profile.service';
import { Post, UserProfile } from '../../types/database.types';
import { HeaderComponent } from '../header/header.component';
import { PostCardComponent } from '../post-card/post-card.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, PostCardComponent],
  templateUrl: './profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:scroll)': 'onScroll()'
  }
})
export class ProfileComponent implements OnDestroy {
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

  // State for user posts
  userPosts: WritableSignal<Post[]> = signal([]);
  loadingPosts = signal(true);
  loadingMorePosts = signal(false);
  postsCurrentPage = signal(0);
  allPostsLoaded = signal(false);
  private readonly POSTS_PER_PAGE = 10;
  private realtimeChannel: RealtimeChannel | null = null;
  private reloadDebounceTimer: any = null;

  constructor() {
    effect(() => {
      // Pre-fill form when profile data loads and we are in edit mode
      if (this.profile() && this.isEditing()) {
        this.setFormFields(this.profile());
      }
    });

    effect(() => {
      const p = this.profile();
      if (p) {
        this.loadUserPosts(true);
        this.setupRealtimeListeners(p.uid);
      } else {
        this.cleanupRealtimeListeners();
        this.userPosts.set([]);
      }
    });
  }

  ngOnDestroy() {
    this.cleanupRealtimeListeners();
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }
  }

  onScroll() {
    const scrollPosition = window.innerHeight + window.scrollY;
    const documentHeight = document.documentElement.scrollHeight;
    
    if (documentHeight - scrollPosition < 300) {
      this.loadMoreUserPosts();
    }
  }

  async loadUserPosts(isInitialLoad = false) {
    const userProfile = this.profile();
    if (!userProfile) return;

    if (isInitialLoad) {
      this.loadingPosts.set(true);
    }
    this.postsCurrentPage.set(0);
    this.allPostsLoaded.set(false);
    
    const posts = await this.supabaseService.getPostsForUser(userProfile.uid, 0, this.POSTS_PER_PAGE);
    this.userPosts.set(posts);
    
    if (posts.length < this.POSTS_PER_PAGE) {
      this.allPostsLoaded.set(true);
    }
    
    if (isInitialLoad) {
      this.loadingPosts.set(false);
    }
    this.cdr.markForCheck();
  }

  async loadMoreUserPosts() {
    if (this.loadingMorePosts() || this.allPostsLoaded() || this.loadingPosts()) return;

    const userProfile = this.profile();
    if (!userProfile) return;

    this.loadingMorePosts.set(true);
    const nextPage = this.postsCurrentPage() + 1;

    const newPosts = await this.supabaseService.getPostsForUser(userProfile.uid, nextPage, this.POSTS_PER_PAGE);

    if (newPosts.length < this.POSTS_PER_PAGE) {
      this.allPostsLoaded.set(true);
    }

    this.userPosts.update(existingPosts => [...existingPosts, ...newPosts]);
    this.postsCurrentPage.set(nextPage);
    this.loadingMorePosts.set(false);
    this.cdr.markForCheck();
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
      
      this.profileService.currentUserProfile.set(updatedProfile);

      this.isEditing.set(false);
      this.avatarFile = null;
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to update profile.');
    } finally {
      this.loading.set(false);
    }
  }

  private debouncedLoadPosts() {
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }
    this.reloadDebounceTimer = setTimeout(() => {
      this.loadUserPosts();
    }, 500);
  }

  private setupRealtimeListeners(userId: string) {
    if (this.realtimeChannel) {
        this.cleanupRealtimeListeners();
    }
    this.realtimeChannel = this.supabaseService.client
        .channel(`profile-posts:${userId}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'posts', filter: `user_id=eq.${userId}` },
            (payload) => this.handlePostInsert(payload.new.id)
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'posts' },
            (payload) => this.handlePostDelete(payload.old.id)
        )
         .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'likes' },
            () => this.debouncedLoadPosts()
        )
        .subscribe();
  }

  private async handlePostInsert(postId: string) {
    const userProfile = this.profile();
    if (!userProfile) return;

    if (this.userPosts().some(p => p.id === postId)) {
        return;
    }

    const { data: postData, error: postError } = await this.supabaseService.client
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (postError || !postData) {
      console.error('Error fetching new post for profile:', postError);
      return;
    }
    
    const newPost: Post = {
      ...postData,
      users: userProfile,
      is_liked: false,
    };
    
    this.userPosts.update(currentPosts => [newPost, ...currentPosts]);
    this.cdr.markForCheck();
  }
  
  private handlePostDelete(postId: string) {
    this.userPosts.update(currentPosts => currentPosts.filter(p => p.id !== postId));
    this.cdr.markForCheck();
  }

  private cleanupRealtimeListeners() {
    if (this.realtimeChannel) {
      this.supabaseService.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }
}
