import { ChangeDetectionStrategy, Component, inject, signal, OnDestroy, effect, viewChild, ElementRef, ChangeDetectorRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';
import { Chat, Message, UserProfile } from '../../types/database.types';
import { SupabaseService } from '../../services/supabase.service';
import { RealtimeChannel, User } from '@supabase/supabase-js';
import { ProfileService } from '../../services/profile.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnDestroy {
  chatService = inject(ChatService);
  supabaseService = inject(SupabaseService);
  profileService = inject(ProfileService);
  private cdr = inject(ChangeDetectorRef);

  chats = this.chatService.chats;
  loadingChats = this.chatService.loadingChats;
  currentUser = this.supabaseService.currentUser;
  
  selectedChat = signal<Chat | null>(null);
  messages = signal<Message[]>([]);
  loadingMessages = signal(false);
  newMessageContent = signal('');
  
  private messageSubscription: RealtimeChannel | null = null;
  private messagesContainer = viewChild<ElementRef>('messagesContainer');

  otherParticipantUsername = computed(() => {
    const chat = this.selectedChat();
    const user = this.currentUser();
    if (!chat || !user || chat.is_group) {
      return '';
    }
    const otherUser = chat.participants.find(p => p.uid !== user.id);
    return otherUser?.username || '';
  });

  constructor() {
    effect(() => {
        const chat = this.selectedChat();
        if (chat) {
            this.loadMessagesForChat(chat.chat_id);
            this.subscribeToMessages(chat.chat_id);
        } else {
            this.unsubscribeFromMessages();
            this.messages.set([]);
        }
    }, { allowSignalWrites: true });
  }

  ngOnDestroy() {
    this.unsubscribeFromMessages();
  }

  selectChat(chat: Chat) {
    if (this.selectedChat()?.chat_id === chat.chat_id) return;
    this.selectedChat.set(chat);
  }

  async loadMessagesForChat(chatId: string) {
    this.loadingMessages.set(true);
    const initialMessages = await this.chatService.getMessages(chatId);
    this.messages.set(initialMessages);
    this.loadingMessages.set(false);
    this.scrollToBottom();
  }

  subscribeToMessages(chatId: string) {
    this.unsubscribeFromMessages(); // Ensure only one subscription is active
    this.messageSubscription = this.chatService.createMessageSubscription(chatId, (newMessage) => {
        // Real-time listener handles all new messages
        this.messages.update(current => [...current, newMessage]);
        this.scrollToBottom();
        this.cdr.markForCheck();
        
        // Also update last message in chats list
        this.chatService.chats.update(chats => 
            chats.map(c => 
                c.chat_id === chatId 
                ? {...c, last_message: newMessage.content, last_message_time: newMessage.created_at} 
                : c
            ).sort((a,b) => (b.last_message_time || 0) - (a.last_message_time || 0))
        );
    });
  }

  unsubscribeFromMessages() {
    if (this.messageSubscription) {
      this.chatService.unsubscribe(this.messageSubscription);
      this.messageSubscription = null;
    }
  }

  async sendMessage() {
    const content = this.newMessageContent().trim();
    const chat = this.selectedChat();
    if (!content || !chat) return;

    const tempMessageContent = content;
    this.newMessageContent.set('');

    const sentMessage = await this.chatService.sendMessage(chat.chat_id, tempMessageContent);
    
    // The real-time listener will now receive the message we just sent.
    // This avoids duplicating messages on the sender's screen.
  }
  
  private scrollToBottom(): void {
    setTimeout(() => {
        const container = this.messagesContainer()?.nativeElement;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, 0);
  }

  formatTimestamp(epochMs: number | null): string {
    if (!epochMs) return '';
    const date = new Date(epochMs);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const diffDays = Math.floor(diffSeconds / 86400);

    if (diffDays >= 7) {
        return date.toLocaleDateString();
    }
    if (diffDays >= 1) {
        return `${diffDays}d ago`;
    }
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  truncate(text: string | null, length: number): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }
}