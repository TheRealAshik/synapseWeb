import { Injectable, signal } from '@angular/core';

export type View = 'home' | 'profile';

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  activeView = signal<View>('home');

  navigateTo(view: View) {
    this.activeView.set(view);
  }
}