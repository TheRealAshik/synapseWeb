import { ChangeDetectionStrategy, Component, effect, inject, signal, WritableSignal, ChangeDetectorRef, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
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
export class HomeComponent implements OnDestroy, AfterViewInit {
  supabaseService = inject(SupabaseService);
  profileService = inject(ProfileService); // Inject ProfileService
  private cdr = inject(ChangeDetectorRef);

  posts: WritableSignal<Post[]> = signal([]);
  newPostContent = signal('');
  loading = signal(true);
  loadingMore = signal(false);
  currentPage = signal(0);
  allPostsLoaded = signal(false);
  private readonly POSTS_PER_PAGE = 10;

  // State for mentions
  showMentionSuggestions = signal(false);
  mentionSuggestions = signal<UserProfile[]>([]);
  mentionLoading = signal(false);
  mentionQuery = signal('');
  confirmedMentions = new Map<string, UserProfile>();

  private realtimeChannel: RealtimeChannel | null = null;
  private reloadDebounceTimer: any = null;

  @ViewChild('loadMoreTrigger') loadMoreTrigger: ElementRef | undefined;
  private observer: IntersectionObserver | undefined;

  constructor() {
    this.loadPosts(true);
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

  ngAfterViewInit(): void {
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    this.cleanupRealtimeListeners();
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }
    this.observer?.disconnect();
  }

  private setupIntersectionObserver() {
    // We use a timeout to ensure the trigger element is in the DOM after a render.
    setTimeout(() => {
      if (this.loadMoreTrigger?.nativeElement) {
        const options = {
          root: null, // relative to viewport
          rootMargin: '0px',
          threshold: 0.1
        };

        this.observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
            this.loadMorePosts();
          }
        }, options);

        this.observer.observe(this.loadMoreTrigger.nativeElement);
      }
    }, 0);
  }

  async loadPosts(isInitialLoad = false) {
    if (isInitialLoad) {
      this.loading.set(true);
    }
    this.currentPage.set(0);
    this.allPostsLoaded.set(false);
    this.observer?.disconnect();
    
    const posts = await this.supabaseService.getPosts(0, this.POSTS_PER_PAGE);
    this.posts.set(posts);
    
    if (posts.length < this.POSTS_PER_PAGE) {
      this.allPostsLoaded.set(true);
    }
    
    if (isInitialLoad) {
      this.loading.set(false);
    }
    this.cdr.markForCheck();

    if (!this.allPostsLoaded()) {
      this.setupIntersectionObserver();
    }
  }

  async loadMorePosts() {
    if (this.loadingMore() || this.allPostsLoaded() || this.loading()) return;

    this.loadingMore.set(true);
    this.observer?.disconnect();
    const nextPage = this.currentPage() + 1;

    const newPosts = await this.supabaseService.getPosts(nextPage, this.POSTS_PER_PAGE);

    if (newPosts.length < this.POSTS_PER_PAGE) {
      this.allPostsLoaded.set(true);
    }

    this.posts.update(existingPosts => [...existingPosts, ...newPosts]);
    this.currentPage.set(nextPage);
    this.loadingMore.set(false);
    this.cdr.markForCheck();
    
    if (!this.allPostsLoaded()) {
      this.setupIntersectionObserver();
    }
  }


  async createPost() {
    const content = this.newPostContent().trim();
    if (!content) return;

    // Find all mentions in the final content to ensure they weren't deleted
    const mentionRegex = /@(\w+)/g;
    const matches = content.match(mentionRegex) || [];
    const finalUsernames = new Set(matches.map(m => m.substring(1)));
    
    const mentionedUserIds = Array.from(this.confirmedMentions.values())
      .filter(user => finalUsernames.has(user.username))
      .map(user => user.uid);
    
    const { error } = await this.supabaseService.createPost(content, mentionedUserIds);
    if (error) {
      console.error('Error creating post:', error);
    } else {
      this.newPostContent.set('');
      this.confirmedMentions.clear();
      this.showMentionSuggestions.set(false);
    }
  }

  onContentChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;

    const textToCursor = text.substring(0, cursorPos);
    const match = textToCursor.match(/@(\w+)$/);

    if (match) {
      const query = match[1];
      this.mentionQuery.set(query);
      this.showMentionSuggestions.set(true);
      this.fetchUserSuggestions(query);
    } else {
      this.showMentionSuggestions.set(false);
    }
  }

  async fetchUserSuggestions(query: string) {
    this.mentionLoading.set(true);
    const users = await this.supabaseService.searchUsers(query);
    this.mentionSuggestions.set(users);
    this.mentionLoading.set(false);
  }

  selectMention(user: UserProfile, textarea: HTMLTextAreaElement) {
    const currentContent = this.newPostContent();
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = currentContent.substring(0, cursorPos);
    
    const mentionQuery = this.mentionQuery();
    const startIndex = textBeforeCursor.lastIndexOf(`@${mentionQuery}`);

    const newContent = 
      currentContent.substring(0, startIndex) + 
      `@${user.username} ` + 
      currentContent.substring(cursorPos);
    
    this.newPostContent.set(newContent);
    this.confirmedMentions.set(user.username, user);
    
    this.showMentionSuggestions.set(false);
    this.mentionSuggestions.set([]);
    this.mentionQuery.set('');

    // Set cursor position after the inserted mention
    setTimeout(() => {
        textarea.focus();
        const newCursorPos = startIndex + `@${user.username} `.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
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
