import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { StudioApi } from '../studio-api';
import { ProjectSummary, TemplateInfo } from '../models';

@Component({
  selector: 'app-projects',
  imports: [RouterLink, DatePipe],
  template: `
    <h1>Build a system without writing code</h1>
    <p class="muted">
      Design your entities, pick a database, and download a complete C# Web API with Swagger and an Angular web app, ready to deploy.
    </p>

    <h2>Start a new project</h2>
    @if (error()) { <div class="alert warn">{{ error() }}</div> }
    <div class="grid">
      @for (t of templates(); track t.key) {
        <div class="card">
          <h3 style="margin:0 0 .25rem">{{ t.name }}</h3>
          <p class="muted small">Starter template · {{ t.entityCount }} entities</p>
          <button class="btn primary" (click)="create(t.key)" [disabled]="busy()">Use template</button>
        </div>
      }
      <div class="card">
        <h3 style="margin:0 0 .25rem">Blank project</h3>
        <p class="muted small">Start from scratch.</p>
        <button class="btn" (click)="create(null)" [disabled]="busy()">Create blank</button>
      </div>
    </div>

    <h2>Your projects</h2>
    @if (projects().length === 0) {
      <p class="muted">No projects yet. Pick a template above.</p>
    } @else {
      <table>
        <thead><tr><th>Name</th><th>Entities</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          @for (p of projects(); track p.id) {
            <tr>
              <td>{{ p.name }}</td>
              <td>{{ p.entityCount }}</td>
              <td>{{ p.updatedUtc | date: 'medium' }}</td>
              <td style="text-align:right; white-space:nowrap">
                <a class="btn sm primary" [routerLink]="['/designer', p.id]">Open</a>
                <a class="btn sm" [routerLink]="['/preview', p.id]">Preview</a>
                <a class="btn sm success" [href]="'/download/' + p.id" download>Download</a>
                <button class="btn sm danger" (click)="remove(p)">Delete</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `
})
export class ProjectsPage {
  private readonly api = inject(StudioApi);
  private readonly router = inject(Router);

  protected readonly templates = signal<TemplateInfo[]>([]);
  protected readonly projects = signal<ProjectSummary[]>([]);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  constructor() {
    this.reload();
    this.api.templates().then((t) => this.templates.set(t)).catch((e) => this.error.set(StudioApi.errors(e).join(' ')));
  }

  private reload() {
    this.api.projects().then((p) => this.projects.set(p)).catch((e) => this.error.set(StudioApi.errors(e).join(' ')));
  }

  protected async create(templateKey: string | null) {
    this.busy.set(true);
    try {
      const { id } = await this.api.create(templateKey);
      await this.router.navigate(['/designer', id]);
    } catch (e) {
      this.error.set(StudioApi.errors(e).join(' '));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(p: ProjectSummary) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    await this.api.remove(p.id);
    this.reload();
  }
}
