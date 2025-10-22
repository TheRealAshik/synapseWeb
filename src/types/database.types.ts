export interface UserProfile {
  id: string;
  uid: string;
  username: string;
  display_name: string;
  avatar: string;
  bio: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  is_following?: boolean; // Client-side state
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  media_urls: string[];
  created_at: string;
  likes_count: number;
  comments_count: number;
  users: UserProfile; // Joined data
  is_liked?: boolean; // Client-side state
}

export interface Like {
  id?: string;
  user_id: string;
  target_id: string;
  target_type: 'post' | 'comment';
}
