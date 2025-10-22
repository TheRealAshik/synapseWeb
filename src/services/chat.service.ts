import { Injectable, signal, inject, computed, effect } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Chat, Message, UserProfile } from '../types/database.types';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private supabaseService = inject(SupabaseService);
  private currentUser = computed(() => this.supabaseService.currentUser());

  chats = signal<Chat[]>([]);
  loadingChats = signal(true);
  
  constructor() {
    effect(() => {
        const user = this.currentUser();
        if (user) {
            this.loadUserChats();
        } else {
            this.chats.set([]);
        }
    });
  }

  async loadUserChats() {
    this.loadingChats.set(true);
    const user = this.currentUser();
    if (!user) {
      this.loadingChats.set(false);
      return;
    }

    // 1. Get user's chat participations
    const { data: participations, error: participationsError } = await this.supabaseService.client
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', user.id);

    if (participationsError) {
      console.error('Error fetching chat participations:', participationsError.message || participationsError);
      this.loadingChats.set(false);
      return;
    }

    const chatIds = participations.map(p => p.chat_id);
    if (chatIds.length === 0) {
        this.chats.set([]);
        this.loadingChats.set(false);
        return;
    }

    // 2. Get chat details
    const { data: chatsData, error: chatsError } = await this.supabaseService.client
      .from('chats')
      .select('*')
      .in('chat_id', chatIds)
      .order('last_message_time', { ascending: false, nullsFirst: false });

    if (chatsError) {
      console.error('Error fetching chats:', chatsError.message || chatsError);
      this.loadingChats.set(false);
      return;
    }

    // 3. Get all participants for these chats
    const { data: allParticipants, error: allParticipantsError } = await this.supabaseService.client
        .from('chat_participants')
        .select('chat_id, user_id')
        .in('chat_id', chatIds);
    
    if (allParticipantsError) {
        console.error('Error fetching all participants:', allParticipantsError.message || allParticipantsError);
        this.loadingChats.set(false);
        return;
    }

    const allParticipantUids = [...new Set(allParticipants.map(p => p.user_id))];

    // 4. Get all user profiles
    const userProfiles = await this.supabaseService.getUserProfiles(allParticipantUids);
    const profilesByUid = new Map(userProfiles.map(p => [p.uid, p]));

    // 5. Assemble the final Chat objects
    const finalChats: Chat[] = chatsData.map(chat => {
        const participantsInChat = allParticipants.filter(p => p.chat_id === chat.chat_id);
        const participantProfiles = participantsInChat
            .map(p => profilesByUid.get(p.user_id))
            .filter((p): p is UserProfile => p !== undefined);

        let displayName = chat.chat_name || 'Group Chat';
        let displayAvatar = chat.chat_avatar || `https://api.dicebear.com/8.x/identicon/svg?seed=${chat.chat_id}`;
        
        if (!chat.is_group && participantProfiles.length > 1) {
            const otherUser = participantProfiles.find(p => p.uid !== user.id);
            if (otherUser) {
                displayName = otherUser.display_name;
                displayAvatar = otherUser.avatar;
            } else if (participantProfiles.length === 1 && participantProfiles[0].uid === user.id) {
                displayName = "Saved Messages";
                displayAvatar = participantProfiles[0].avatar;
            }
        }

        return {
            ...chat,
            participants: participantProfiles,
            display_name: displayName,
            display_avatar: displayAvatar,
        };
    });

    this.chats.set(finalChats);
    this.loadingChats.set(false);
  }

  async getMessages(chatId: string, page: number = 0, limit: number = 30): Promise<Message[]> {
    const from = page * limit;
    const to = from + limit - 1;

    const { data, error } = await this.supabaseService.client
      .from('messages')
      .select(`
        *,
        sender:users(uid, display_name, avatar)
      `)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
    
    return (data as any[]).map(m => ({...m, sender: m.sender as UserProfile})).reverse();
  }

  async sendMessage(chatId: string, content: string): Promise<Message | null> {
    const user = this.currentUser();
    if (!user) return null;

    const { data, error } = await this.supabaseService.client
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        content: content,
      })
      .select()
      .single();

    if (error) {
      console.error('Error sending message:', error);
      return null;
    }

    await this.supabaseService.client
        .from('chats')
        .update({
            last_message: content,
            last_message_time: data.created_at,
            last_message_sender: user.id
        })
        .eq('chat_id', chatId);

    return data;
  }
  
  createMessageSubscription(chatId: string, onNewMessage: (message: Message) => void): RealtimeChannel {
    const channel = this.supabaseService.client
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const newMessageData = payload.new as Message;
          
          const { data: senderProfile } = await this.supabaseService.client
            .from('users')
            .select('uid, display_name, avatar')
            .eq('uid', newMessageData.sender_id)
            .single();

          const messageWithSender: Message = {
            ...newMessageData,
            sender: senderProfile as UserProfile
          };
          onNewMessage(messageWithSender);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to chat ${chatId}`);
        }
      });

    return channel;
  }

  unsubscribe(channel: RealtimeChannel) {
    this.supabaseService.client.removeChannel(channel);
  }
}