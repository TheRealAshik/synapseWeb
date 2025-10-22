import { ChangeDetectionStrategy, Component, input, WritableSignal, signal, inject, ChangeDetectorRef, Signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Post } from '../../types/database.types';
import { SupabaseService } from '../../services/supabase.service';
import { User } from '@supabase/supabase-js';

@Component({
  selector: 'app-post-card',
  imports: [CommonModule],
  templateUrl: './post-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostCardComponent {
  post = input.required<Post>();
  supabaseService = inject(SupabaseService);
  private cdr = inject(ChangeDetectorRef);

  isLiking = signal(false);
  isFollowing = signal(false);
  currentUser: Signal<User | null>;

  // State for delete functionality
  isMenuOpen = signal(false);
  showDeleteConfirm = signal(false);
  isDeleting = signal(false);

  parsedContent = computed(() => {
    const post = this.post();
    if (!post) return [];

    const content = post.content;
    const regex = /@(\w+)/g;
    const parts: { type: 'text' | 'mention'; value: string; username?: string }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.substring(lastIndex, match.index) });
      }
      // Add the mention
      parts.push({ type: 'mention', value: match[0], username: match[1] });
      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({ type: 'text', value: content.substring(lastIndex) });
    }
    
    return parts;
  });

  constructor() {
    this.currentUser = this.supabaseService.currentUser;
  }

  toggleMenu(event: Event) {
    event.stopPropagation();
    this.isMenuOpen.update(v => !v);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
  }

  openDeleteConfirm(event: Event) {
    event.stopPropagation();
    this.isMenuOpen.set(false);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
  }

  async confirmDelete() {
    if (this.isDeleting()) return;
    this.isDeleting.set(true);

    const { error } = await this.supabaseService.deletePost(this.post().id);
    
    if (error) {
        console.error('Error deleting post:', error);
        this.isDeleting.set(false);
        this.showDeleteConfirm.set(false); // Close modal on error
        // Optionally show an error message to the user
    }
    // On success, the realtime listener in HomeComponent will remove the post from the feed.
    // The component will be destroyed, so no need to reset state here.
  }

  async handleLike() {
    if (this.isLiking()) return;
    this.isLiking.set(true);

    const currentPost = this.post();
    const optimisticLiked = !currentPost.is_liked;
    const optimisticLikesCount = currentPost.is_liked ? currentPost.likes_count - 1 : currentPost.likes_count + 1;

    currentPost.is_liked = optimisticLiked;
    currentPost.likes_count = optimisticLikesCount;
    this.cdr.markForCheck();
    
    const { error } = await this.supabaseService.toggleLike(currentPost);

    if (error) {
      console.error('Error toggling like:', (error as any).message ?? error);
      currentPost.is_liked = !optimisticLiked;
      currentPost.likes_count = currentPost.is_liked ? optimisticLikesCount + 1 : optimisticLikesCount - 1;
      this.cdr.markForCheck();
    }
    
    this.isLiking.set(false);
  }

  async handleFollow() {
    if (this.isFollowing()) return;
    this.isFollowing.set(true);

    const currentPost = this.post();
    const userToFollow = currentPost.users;
    const optimisticFollowing = !userToFollow.is_following;
    
    // Optimistic Update
    userToFollow.is_following = optimisticFollowing;
    this.cdr.markForCheck();

    const { error } = optimisticFollowing
      ? await this.supabaseService.followUser(userToFollow.uid)
      : await this.supabaseService.unfollowUser(userToFollow.uid);

    if (error) {
      console.error('Error toggling follow:', error);
      // Revert on error
      userToFollow.is_following = !optimisticFollowing;
      this.cdr.markForCheck();
    }

    this.isFollowing.set(false);
  }

  timeAgo(dateString: string): string {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "m";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    return Math.floor(seconds) + "s";
  }
}