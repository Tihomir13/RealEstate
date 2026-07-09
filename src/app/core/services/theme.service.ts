import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly theme = signal<Theme>('light');

  constructor() {
    if (this.isBrowser) {
      const stored = localStorage.getItem('imoti-theme') as Theme | null;
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      this.theme.set(stored ?? (prefersDark ? 'dark' : 'light'));
    }
    effect(() => {
      const t = this.theme();
      if (this.isBrowser) {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('imoti-theme', t);
      }
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }
}
