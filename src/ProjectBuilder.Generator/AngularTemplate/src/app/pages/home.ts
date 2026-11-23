import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_NAME, ENTITIES } from '../entities';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <h1>{{ appName }}</h1>
    <div class="grid">
      @for (e of entities; track e.name) {
        <a class="card" [routerLink]="['/e', e.route]">
          <strong>{{ e.plural }}</strong>
          <div class="muted">{{ e.fields.length }} fields</div>
        </a>
      }
    </div>
  `
})
export class HomePage {
  protected readonly appName = APP_NAME;
  protected readonly entities = ENTITIES;
}
