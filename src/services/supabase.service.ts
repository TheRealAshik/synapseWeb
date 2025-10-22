import { Injectable, signal, WritableSignal, inject } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { Post, Like, UserProfile } from '../types/database.types';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly PROFILE_NEEDS_COMPLETION_SENTINEL = '__SYNAPSE_PROFILE_NEEDS_COMPLETION__';

  currentUser: WritableSignal<User | null> = signal(null);
  currentSession: WritableSignal<Session | null> = signal(null);
  profileNeedsCompletion = signal(false);

  constructor() {
    this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);

    this.supabase.auth.onAuthStateChange(async (event, session) => {
      this.currentSession.set(session);
      const user = session?.user ?? null;
      this.currentUser.set(user);
      
      if (user) {
        await this.checkAndCreateUserProfile(user);
      } else {
        this.profileNeedsCompletion.set(false);
      }
    });
    
    // Initial session load
    this.supabase.auth.getSession().then(async ({ data }) => {
        this.currentSession.set(data.session);
        const user = data.session?.user ?? null;
        this.currentUser.set(user);
        if (user) {
          await this.checkAndCreateUserProfile(user);
        }
    });
  }

  async checkAndCreateUserProfile(user: User) {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, bio')
      .eq('uid', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking user profile:', error);
      this.profileNeedsCompletion.set(false);
      return;
    }

    if (data) {
      this.profileNeedsCompletion.set(data.bio === this.PROFILE_NEEDS_COMPLETION_SENTINEL);
      return;
    }

    const username = user.user_metadata.username || user.email!.split('@')[0];
    const displayName = user.user_metadata.display_name || username;
    const avatar = user.user_metadata.avatar || `https://api.dicebear.com/8.x/lorelei/svg?seed=${username}`;

    const { error: insertError } = await this.supabase.from('users').insert({
      uid: user.id,
      email: user.email,
      username: username,
      display_name: displayName,
      avatar: avatar,
      bio: this.PROFILE_NEEDS_COMPLETION_SENTINEL,
    });

    if (insertError) {
      console.error('Failed to create user profile on first login:', insertError);
      this.profileNeedsCompletion.set(false);
    } else {
      this.profileNeedsCompletion.set(true);
    }
  }

  get client() {
    return this.supabase;
  }

  async signInWithEmail(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  async signUpWithEmail(email: string, password: string, username: string) {
    return this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
          display_name: username,
          avatar: `https://api.dicebear.com/8.x/lorelei/svg?seed=${username}`
        }
      }
    });
  }

  async signOut() {
    return this.supabase.auth.signOut();
  }

  async getPosts(page: number = 0, limit: number = 10): Promise<Post[]> {
    const from = page * limit;
    const to = from + limit - 1;

    // Step 1: Fetch raw posts
    const { data: rawPosts, error: postsError } = await this.supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (postsError) {
      console.error('Error fetching posts:', postsError);
      return [];
    }
    if (!rawPosts || rawPosts.length === 0) {
      return [];
    }

    // Step 2: Collect user UIDs and fetch user profiles
    const userUids = [...new Set(rawPosts.map((p) => p.user_id))];
    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, uid, username, display_name, avatar, bio')
      .in('uid', userUids);

    if (usersError) {
      console.error('Error fetching users for posts:', usersError);
      return [];
    }

    const usersByUid = new Map(users.map((u) => [u.uid, u as UserProfile]));

    // Step 3: Combine posts with their user profiles
    let posts: Post[] = rawPosts
      .map((p) => {
        const userProfile = usersByUid.get(p.user_id);
        if (!userProfile) {
          return null;
        }
        return { ...p, users: userProfile } as Post;
      })
      .filter((p): p is Post => p !== null);

    // Step 4: Fetch likes and follow status for the current user
    const currentUser = this.currentUser();
    if (!currentUser) {
      return posts;
    }

    const postIds = posts.map((p) => p.id);
    const authorUids = [...new Set(posts.map((p) => p.users.uid))];

    const [likesResult, followsResult] = await Promise.all([
      this.supabase
        .from('likes')
        .select('target_id')
        .eq('user_id', currentUser.id)
        .in('target_id', postIds)
        .eq('target_type', 'post'),
      this.supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUser.id)
        .in('following_id', authorUids),
    ]);

    const likedPostIds = new Set(likesResult.data?.map((l) => l.target_id) || []);
    const followedUserIds = new Set(followsResult.data?.map((f) => f.following_id) || []);

    // Step 5: Augment posts with like and follow status
    return posts.map((post) => ({
      ...post,
      is_liked: likedPostIds.has(post.id),
      users: {
        ...post.users,
        is_following: followedUserIds.has(post.users.uid),
      },
    }));
  }

  async getPostsForUser(userId: string, page: number = 0, limit: number = 10): Promise<Post[]> {
    const from = page * limit;
    const to = from + limit - 1;

    // Step 1: Fetch raw posts for the user
    const { data: rawPosts, error: postsError } = await this.supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (postsError) {
      console.error(`Error fetching posts for user ${userId}:`, postsError);
      return [];
    }
    if (!rawPosts || rawPosts.length === 0) {
      return [];
    }
    
    // Step 2: Fetch the user's profile (author of all these posts)
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id, uid, username, display_name, avatar, bio')
      .eq('uid', userId)
      .single();

    if (userError) {
      console.error('Error fetching user for posts:', userError);
      return [];
    }

    const userProfile = user as UserProfile;

    // Step 3: Combine posts with their user profiles
    let posts: Post[] = rawPosts.map((p) => ({
      ...p,
      users: userProfile,
    }));

    // Step 4: Fetch likes for the current user
    const currentUser = this.currentUser();
    if (!currentUser) {
      return posts; // Return posts without like status if no user is logged in
    }

    const postIds = posts.map((p) => p.id);

    const { data: likes } = await this.supabase
      .from('likes')
      .select('target_id')
      .eq('user_id', currentUser.id)
      .in('target_id', postIds)
      .eq('target_type', 'post');

    const likedPostIds = new Set(likes?.map((l) => l.target_id) || []);

    // Step 5: Augment posts with like status.
    // is_following is implicitly false for own posts.
    return posts.map((post) => ({
      ...post,
      is_liked: likedPostIds.has(post.id),
      users: {
        ...post.users,
        is_following: false,
      },
    }));
  }

  async createPost(content: string, mentionedUserIds: string[] = []) {
    const user = this.currentUser();
    if (!user) throw new Error('User not authenticated');
    
    const { data: postData, error } = await this.supabase.from('posts').insert({
      user_id: user.id,
      content: content,
      mentions: mentionedUserIds.length > 0 ? mentionedUserIds : null,
    }).select('id').single();

    if (error) {
      console.error('Error creating post:', error);
      return { error };
    }

    if (mentionedUserIds.length > 0 && postData) {
      await this.createMentionNotifications(postData.id, mentionedUserIds);
    }
    
    return { error: null };
  }

  private async createMentionNotifications(postId: string, mentionedUserIds: string[]) {
    const user = this.currentUser();
    if (!user) return;
    
    const { data: authorProfile } = await this.supabase
      .from('users')
      .select('display_name')
      .eq('uid', user.id)
      .single();

    const authorDisplayName = authorProfile?.display_name || 'Someone';

    const notifications = mentionedUserIds.map(mentionedUid => ({
      user_id: mentionedUid,
      sender_id: user.id,
      type: 'mention',
      message: `${authorDisplayName} mentioned you in a post.`,
      data: { postId },
      action_url: `/post/${postId}`
    }));

    const { error } = await this.supabase.from('notifications').insert(notifications);
    if (error) {
      console.error('Error creating mention notifications:', error);
    }
  }

  async deletePost(postId: string) {
    const user = this.currentUser();
    if (!user) throw new Error('User not authenticated');
    // RLS in Supabase ensures that users can only delete their own posts.
    return this.supabase.from('posts').delete().eq('id', postId);
  }

  async toggleLike(post: Post) {
      const user = this.currentUser();
      if (!user) throw new Error('User not authenticated');
      
      const like = {
          user_id: user.id,
          target_id: post.id,
          target_type: 'post' as const
      };
      
      // The `post` object is optimistically updated by the component.
      // If `is_liked` is true, the user just liked it, so we INSERT.
      if (post.is_liked) {
          return this.supabase.from('likes').insert(like);
      } else {
          // If `is_liked` is false, the user just unliked it, so we DELETE.
          return this.supabase.from('likes').delete().match(like);
      }
  }

  async followUser(followingId: string) {
    const user = this.currentUser();
    if (!user) throw new Error('User not authenticated');
    return this.supabase.from('follows').insert({ follower_id: user.id, following_id: followingId });
  }

  async unfollowUser(followingId: string) {
    const user = this.currentUser();
    if (!user) throw new Error('User not authenticated');
    return this.supabase.from('follows').delete().match({ follower_id: user.id, following_id: followingId });
  }

  async uploadAvatar(file: File): Promise<string> {
    const user = this.currentUser();
    if (!user) throw new Error('User not authenticated');

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error } = await this.supabase.storage
      .from('media')
      .upload(filePath, file, { upsert: true });

    if (error) {
      console.error('Error uploading avatar:', error);
      throw error;
    }
    
    const { data } = this.supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return `${data.publicUrl}?t=${new Date().getTime()}`;
  }

  async updateProfile(profileData: { username?: string; display_name?: string; bio?: string; avatar?: string; }) {
    const user = this.currentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await this.supabase
      .from('users')
      .update(profileData)
      .eq('uid', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
    return data as UserProfile;
  }

  async searchUsers(query: string): Promise<UserProfile[]> {
    if (!query || query.length < 1) {
      return [];
    }
    const { data, error } = await this.supabase
      .from('users')
      .select('uid, username, display_name, avatar')
      .ilike('username', `${query}%`)
      .limit(5);

    if (error) {
      console.error('Error searching users:', error);
      return [];
    }
    return data as UserProfile[];
  }

  async getUserProfiles(uids: string[]): Promise<UserProfile[]> {
    if (!uids || uids.length === 0) {
      return [];
    }
    const { data, error } = await this.supabase
      .from('users')
      .select('uid, username, display_name, avatar')
      .in('uid', uids);

    if (error) {
      console.error('Error fetching user profiles:', error);
      return [];
    }
    return data as UserProfile[];
  }
}