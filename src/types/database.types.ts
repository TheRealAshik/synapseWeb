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
  is_online?: boolean;
  last_seen?: string;
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

export interface Chat {
  id: string; // This is the UUID from the chats table
  chat_id: string; // The text-based unique ID
  is_group: boolean;
  chat_name: string | null;
  chat_avatar: string | null;
  last_message: string | null;
  last_message_time: number | null;
  // UI-specific properties
  participants: UserProfile[];
  display_name: string; // Computed display name
  display_avatar: string; // Computed avatar
  unread_count?: number; // UI state
}

export interface Message {
  id: string; // UUID
  chat_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: number; // BIGINT as epoch ms
  sender?: UserProfile; // Joined sender data
}

export interface ChatParticipant {
  id: string; // UUID
  chat_id: string;
  user_id: string;
  role: string;
  is_admin: boolean;
}
