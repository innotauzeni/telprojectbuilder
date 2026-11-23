import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header>
      <a routerLink="/" class="brand">ProjectBuilder <span>Studio</span></a>
    </header>
    <main><router-outlet /></main>
  `,
  styles: `
    header { background: #111827; padding: .8rem 1.5rem; }
    .brand { color: #fff; font-weight: 700; font-size: 1.1rem; }
    .brand span { color: #93c5fd; font-weight: 500; }
    main { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
  `
})
export class App {}
