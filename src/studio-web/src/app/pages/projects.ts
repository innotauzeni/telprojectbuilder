import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ConfirmService } from '../core/confirm.service';
import { ToastService } from '../core/toast.service';
import { StudioApi } from '../studio-api';
import { ProjectSummary, TemplateInfo } from '../models';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-projects',
  imports: [RouterLink, DatePipe, Icon],
  template: `
    <section class="hero">
      <h1>Build a complete system without writing code</h1>
      <p>
        Design your data, pick a database and download a production-ready C# Web API with Swagger, login and roles,
        plus a modern Angular web app and Docker files. It's all yours, with no lock-in.
      </p>
      <div class="row">
        <button class="btn primary" (click)="create(templates()[0]?.key ?? null)" [disabled]="busy()"><app-icon name="sparkles" [size]="16" /> Start with a template</button>
        <button class="btn" (click)="create(null)" [disabled]="busy()"><app-icon name="plus" [size]="16" /> Blank project</button>
      </div>
      <div class="pills">
        <span class="pill"><app-icon name="code" [size]="14" /> C# &amp; ASP.NET Core</span>
        <span class="pill"><app-icon name="globe" [size]="14" /> Angular web app</span>
        <span class="pill"><app-icon name="database" [size]="14" /> SQL Server · PostgreSQL · SQLite</span>
        <span class="pill"><app-icon name="shield" [size]="14" /> JWT login &amp; roles</span>
      </div>
    </section>

    @if (error()) { <div class="alert error" style="margin-top:1rem" role="alert"><app-icon name="alert" />{{ error() }}</div> }

    <h2 style="margin:2rem 0 1rem">Start a new project</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
      @for (t of templates(); track t.key) {
        <div class="card">
          <div class="row" style="margin-bottom:.6rem">
            <span class="chip" style="display:inline-grid;place-items:center;width:38px;height:38px;padding:0"><app-icon name="graduation-cap" [size]="20" /></span>
            <span class="badge primary">Template</span>
          </div>
          <h3>{{ t.name }}</h3>
          <p class="muted small" style="margin:.25rem 0 1rem">{{ t.entityCount }} entities · API, web app and dynamic menu included</p>
          <button class="btn primary" (click)="create(t.key)" [disabled]="busy()">Use this template</button>
        </div>
      }
      <div class="card">
        <div class="row" style="margin-bottom:.6rem">
          <span class="chip" style="display:inline-grid;place-items:center;width:38px;height:38px;padding:0"><app-icon name="plus" [size]="20" /></span>
        </div>
        <h3>Blank project</h3>
        <p class="muted small" style="margin:.25rem 0 1rem">Start from scratch and add your own entities.</p>
        <button class="btn" (click)="create(null)" [disabled]="busy()">Create blank</button>
      </div>
    </div>

    <h2 style="margin:2rem 0 1rem">Your projects</h2>
    <div class="card table-card">
      @if (projects().length === 0) {
        <div class="empty">
          <div class="ico"><app-icon name="layers" [size]="26" /></div>
          <h3>No projects yet</h3>
          <p>Pick a template above to create your first system.</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Name</th><th>Entities</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              @for (p of projects(); track p.id) {
                <tr>
                  <td><a [routerLink]="['/designer', p.id]" style="font-weight:600">{{ p.name }}</a></td>
                  <td><span class="badge">{{ p.entityCount }}</span></td>
                  <td class="muted">{{ p.updatedUtc | date: 'medium' }}</td>
                  <td class="actions">
                    <a class="btn" [routerLink]="['/designer', p.id]"><app-icon name="edit" [size]="15" /> Open</a>
                    <a class="btn" [routerLink]="['/preview', p.id]"><app-icon name="eye" [size]="15" /> Preview</a>
                    <a class="btn" [href]="'/download/' + p.id" download><app-icon name="download" [size]="15" /> Download</a>
                    <button class="btn icon ghost danger" (click)="remove(p)" aria-label="Delete project"><app-icon name="trash" [size]="16" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `
})
export class ProjectsPage {
  private readonly api = inject(StudioApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

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
    const ok = await this.confirm.ask(`“${p.name}” and its design will be permanently deleted.`,
      { title: 'Delete project?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    await this.api.remove(p.id);
    this.toast.success('Project deleted.');
    this.reload();
  }
}
