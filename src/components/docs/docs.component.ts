import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationService } from '../../services/navigation.service';

interface DocPage {
  id: string;
  title: string;
  content: string;
}

interface DocSection {
  id: string;
  title: string;
  pages: DocPage[];
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './docs.component.html',
  styleUrls: ['./docs.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsComponent {
  navigationService = inject(NavigationService);

  activePageId = signal<string>('getting-started');
  expandedSections = signal<Set<string>>(new Set(['start', 'features']));

  docStructure: DocSection[] = [
    {
      id: 'start',
      title: 'Start',
      pages: [
        { id: 'getting-started', title: 'Getting Started', content: '<h1>Getting Started</h1><p>Welcome to Synapse Social! This guide will walk you through the basics of setting up your account and making your first post.</p>' },
        { id: 'community-guidelines', title: 'Community Guidelines', content: '<h1>Community Guidelines</h1><p>We want Synapse Social to be a safe and welcoming place for everyone. Please read our guidelines on acceptable behavior.</p>' },
      ],
    },
    {
      id: 'features',
      title: 'Features',
      pages: [
        { id: 'the-feed', title: 'The Feed', content: '<h1>The Feed</h1><p>The home feed is where you\'ll see posts from people you follow. It\'s updated in real-time!</p>' },
        { id: 'creating-posts', title: 'Creating Posts', content: '<h1>Creating Posts</h1><p>Share your thoughts with the world. You can write text-based posts and soon, you\'ll be able to add images and videos.</p>' },
        { id: 'profiles', title: 'Profiles', content: '<h1>Profiles</h1><p>Your profile is your personal space. Customize your avatar, display name, and bio to show people who you are.</p>' },
        { id: 'following-users', title: 'Following Users', content: '<h1>Following Users</h1><p>Follow other users to see their posts in your feed. You can manage who you follow from their profile pages.</p>' },
      ],
    },
    {
      id: 'for-developers',
      title: 'For Developers',
      pages: [
        { id: 'api-reference', title: 'API Reference', content: '<h1>API Reference</h1><p>Our application is built on Supabase. Explore the database schema and API endpoints to build your own integrations.</p>' },
        { id: 'authentication', title: 'Authentication', content: '<h1>Authentication</h1><p>User authentication is handled via Supabase Auth, supporting email/password and social logins.</p>' },
        { id: 'realtime-subscriptions', title: 'Realtime Subscriptions', content: '<h1>Realtime Subscriptions</h1><p>Learn how we use Supabase Realtime to instantly update feeds, likes, and follows across all clients.</p>' },
      ],
    },
    {
        id: 'account',
        title: 'Account',
        pages: [
            { id: 'settings', title: 'Settings', content: '<h1>Settings</h1><p>Manage your account settings, including your email, password, and notification preferences.</p>' },
            { id: 'privacy', title: 'Privacy', content: '<h1>Privacy</h1><p>Your privacy is important. Learn about our data policies and how you can control your information.</p>' },
        ]
    }
  ];

  activePage = computed(() => {
    const pageId = this.activePageId();
    for (const section of this.docStructure) {
      const foundPage = section.pages.find(p => p.id === pageId);
      if (foundPage) return foundPage;
    }
    return this.docStructure[0].pages[0]; // Fallback to first page
  });

  toggleSection(sectionId: string): void {
    this.expandedSections.update(currentSet => {
      const newSet = new Set(currentSet);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }

  selectPage(pageId: string): void {
    this.activePageId.set(pageId);
    window.scrollTo(0, 0); // Scroll to top on page change
  }

  goHome(): void {
    this.navigationService.navigateTo('home');
  }
}
