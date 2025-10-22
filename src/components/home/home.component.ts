import { ChangeDetectionStrategy, Component, effect, inject, signal, WritableSignal, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ProfileService } from '../../services/profile.service';
import { PostCardComponent } from '../post-card/post-card.component';
import { HeaderComponent } from '../header/header.component';
import { Post, UserProfile } from '../../types/database.types';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule, PostCardComponent, HeaderComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnDestroy {
  supabaseService = inject(SupabaseService);
  profileService = inject(ProfileService); // Inject ProfileService
  private cdr = inject(ChangeDetectorRef);

  posts: WritableSignal<Post[]> = signal([]);
  newPostContent = signal('');
  loading = signal(true);
  private realtimeChannel: RealtimeChannel | null = null;
  private reloadDebounceTimer: any = null;

  constructor() {
    this.loadPosts();
    // Eagerly load profile service to start fetching data
    this.profileService.currentUserProfile();
    
    effect(() => {
        const user = this.supabaseService.currentUser();
        if (user && !this.realtimeChannel) {
            this.setupRealtimeListeners();
        } else if (!user && this.realtimeChannel) {
            this.cleanupRealtimeListeners();
        }
    });
  }

  ngOnDestroy() {
    this.cleanupRealtimeListeners();
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }
  }

  async loadPosts() {
    this.loading.set(true);
    const posts = await this.supabaseService.getPosts();
    this.posts.set(posts);
    this.loading.set(false);
    this.cdr.markForCheck();
  }

  async createPost() {
    const content = this.newPostContent().trim();
    if (!content) return;
    
    const { error } = await this.supabaseService.createPost(content);
    if (error) {
      console.error('Error creating post:', error);
    } else {
      this.newPostContent.set('');
    }
  }

  private debouncedLoadPosts() {
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }
    this.reloadDebounceTimer = setTimeout(() => {
      this.loadPosts();
    }, 500); // Debounce time to avoid rapid reloads
  }

  private setupRealtimeListeners() {
    this.realtimeChannel = this.supabaseService.client
        .channel('public:posts')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'posts' },
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
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'follows' },
            () => this.debouncedLoadPosts()
        )
        .subscribe();
  }

  private async handlePostInsert(postId: string) {
    // Step 1: Fetch the new post
    const { data: postData, error: postError } = await this.supabaseService.client
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (postError) {
      console.error('Error fetching new post:', postError);
      return;
    }

    if (!postData) {
      return;
    }

    // Step 2: Fetch the author's profile
    const { data: userData, error: userError } = await this.supabaseService.client
      .from('users')
      .select('id, uid, username, display_name, avatar, bio')
      .eq('uid', postData.user_id)
      .single();
    
    if (userError) {
      console.error('Error fetching user profile for new post:', userError);
      return;
    }

    if (!userData) {
      return;
    }

    // Step 3: Combine data into a Post object
    const newPost: Post = {
      ...postData,
      users: userData as UserProfile,
      is_liked: false, // New posts are not liked by the current user by default
    };

    // Step 4: Check if we are already following this user from existing posts
    const existingPostFromAuthor = this.posts().find(p => p.user_id === newPost.user_id);
    newPost.users.is_following = existingPostFromAuthor ? existingPostFromAuthor.users.is_following : false;

    this.posts.update(currentPosts => [newPost, ...currentPosts]);
    this.cdr.markForCheck();
  }
  
  private handlePostDelete(postId: string) {
    this.posts.update(currentPosts => currentPosts.filter(p => p.id !== postId));
    this.cdr.markForCheck();
  }

  private cleanupRealtimeListeners() {
    if (this.realtimeChannel) {
      this.supabaseService.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }
}