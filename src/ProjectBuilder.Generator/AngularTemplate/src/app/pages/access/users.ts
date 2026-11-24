import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccessService, RoleDto, UserDto } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';

type Dialog =
  | { kind: 'add'; email: string; password: string; roles: Set<string> }
  | { kind: 'roles'; user: UserDto; roles: Set<string> }
  | { kind: 'password'; user: UserDto; password: string };

/** Users: add people, change their roles, reset a password, deactivate or reactivate an account. */
@Component({
  selector: 'app-users',
  imports: [FormsModule, Icon],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <h1>Users <span class="badge primary" style="vertical-align:middle">{{ items().length }}</span></h1>
          <span class="muted small">Who can sign in, and which roles they hold. Changes apply immediately, even to people who are signed in.</span>
        </div>
        <span class="spacer"></span>
        <div style="position:relative; width:230px">
          <span style="position:absolute; left:.7rem; top:50%; transform:translateY(-50%); color:var(--muted)"><app-icon name="search" [size]="16" /></span>
          <input type="text" placeholder="Search users…" aria-label="Search users" style="padding-left:2.1rem" (input)="filter.set($any($event.target).value)" />
        </div>
        <button class="btn primary" (click)="openAdd()"><app-icon name="plus" [size]="16" /> Add user</button>
      </div>

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() }}</div> }

      <div class="card table-card">
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>User</th><th>Roles</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { @for (i of [1, 2, 3]; track i) { <tr><td colspan="4"><div class="skeleton" style="height:1.1rem"></div></td></tr> } }
              @for (u of shown(); track u.id) {
                <tr>
                  <td>
                    <div class="row" style="flex-wrap:nowrap">
                      <span class="chip" style="display:inline-grid;place-items:center;width:34px;height:34px;padding:0;border-radius:50%">{{ u.email[0].toUpperCase() }}</span>
                      <div style="font-weight:600">{{ u.email }} @if (u.isMe) { <span class="badge" style="margin-left:.3rem">you</span> }</div>
                    </div>
                  </td>
                  <td>
                    @for (r of u.roles; track r) { <span class="chip" style="margin-right:.25rem">{{ r }}</span> }
                    @empty { <span class="muted small">No role</span> }
                  </td>
                  <td><span class="badge" [class.ok]="u.active" [class.no]="!u.active">{{ u.active ? 'Active' : 'Deactivated' }}</span></td>
                  <td class="actions"><div class="actions-wrap">
                    <button class="btn sm" (click)="openRoles(u)"><app-icon name="shield" [size]="14" /> Roles</button>
                    <button class="btn sm" (click)="openPassword(u)"><app-icon name="key" [size]="14" /> Reset password</button>
                    @if (!u.isMe) {
                      @if (u.active) {
                        <button class="btn sm danger" (click)="deactivate(u)"><app-icon name="x" [size]="14" /> Deactivate</button>
                      } @else {
                        <button class="btn sm" (click)="activate(u)"><app-icon name="check" [size]="14" /> Activate</button>
                      }
                    }
                  </div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!loading() && shown().length === 0) {
          <div class="empty"><div class="ico"><app-icon name="users" [size]="26" /></div><h3>No users found</h3><p>@if (filter()) { Nothing matches “{{ filter() }}”. } @else { Add the first user. }</p></div>
        }
      </div>
    </div>

    @if (dialog(); as d) {
      <div class="backdrop" (click)="dialog.set(null)">
        <form class="dialog wide" (ngSubmit)="submit()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="User">
          @switch (d.kind) {
            @case ('add') { <h2>Add user</h2> }
            @case ('roles') { <h2>Roles for {{ d.user.email }}</h2> }
            @case ('password') { <h2>Reset password for {{ d.user.email }}</h2> }
          }
          @if (formError()) { <div class="alert error" role="alert" style="margin-top:.75rem"><app-icon name="alert" />{{ formError() }}</div> }

          <div style="margin-top:1rem">
            @if (d.kind === 'add') {
              <div class="form-grid">
                <div class="full"><label class="lbl" for="u-email">Email <span class="req">*</span></label>
                  <input id="u-email" name="email" type="email" [(ngModel)]="d.email" required maxlength="200" autocomplete="off" /></div>
                <div class="full"><label class="lbl" for="u-pass">Password <span class="req">*</span></label>
                  <input id="u-pass" name="password" type="password" [(ngModel)]="d.password" required autocomplete="new-password" />
                  <div class="hint">At least 8 characters with upper and lower case letters, a number and a symbol.</div></div>
              </div>
            }
            @if (d.kind === 'password') {
              <label class="lbl" for="u-new">New password <span class="req">*</span></label>
              <input id="u-new" name="newPassword" type="password" [(ngModel)]="d.password" required autocomplete="new-password" />
              <div class="hint">Share it with the person securely and ask them to keep it private.</div>
            }
            @if (d.kind === 'add' || d.kind === 'roles') {
              <label class="lbl" style="margin-top:1rem">Roles</label>
              <div class="checks">
                @for (r of roles(); track r.id) {
                  <label class="check" [class.on]="d.roles.has(r.name)">
                    <input type="checkbox" [checked]="d.roles.has(r.name)" (change)="toggleRole(d.roles, r.name)" /> {{ r.name }}
                  </label>
                }
              </div>
            }
          </div>

          <div class="row" style="justify-content:flex-end;margin-top:1.25rem">
            <button class="btn" type="button" (click)="dialog.set(null)">Cancel</button>
            <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    }
  `
})
export class UsersPage {
  private readonly access = inject(AccessService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly items = signal<UserDto[]>([]);
  protected readonly roles = signal<RoleDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly filter = signal('');
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  protected readonly shown = computed(() => {
    const q = this.filter().trim().toLowerCase();
    return q ? this.items().filter((u) => u.email.toLowerCase().includes(q) || u.roles.some((r) => r.toLowerCase().includes(q))) : this.items();
  });

  constructor() { this.load(); }

  private async load() {
    try {
      this.items.set(await this.access.users());
      this.roles.set(await this.access.roles());
      this.error.set('');
    } catch (e) { this.error.set(ApiService.message(e)); }
    this.loading.set(false);
  }

  protected toggleRole(set: Set<string>, name: string) { if (set.has(name)) set.delete(name); else set.add(name); }

  protected openAdd() { this.formError.set(''); this.dialog.set({ kind: 'add', email: '', password: '', roles: new Set(this.roles().some((r) => r.name === 'User') ? ['User'] : []) }); }
  protected openRoles(user: UserDto) { this.formError.set(''); this.dialog.set({ kind: 'roles', user, roles: new Set(user.roles) }); }
  protected openPassword(user: UserDto) { this.formError.set(''); this.dialog.set({ kind: 'password', user, password: '' }); }

  protected async submit() {
    const d = this.dialog();
    if (!d) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      if (d.kind === 'add') { await this.access.createUser({ email: d.email, password: d.password, roles: [...d.roles] }); this.toast.success('User added.'); }
      else if (d.kind === 'roles') { await this.access.setUserRoles(d.user.id, [...d.roles]); this.toast.success('Roles updated.'); }
      else { await this.access.resetPassword(d.user.id, d.password); this.toast.success('Password reset.'); }
      this.dialog.set(null);
      await this.load();
    } catch (e) {
      this.formError.set(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async deactivate(u: UserDto) {
    const ok = await this.confirm.ask(`${u.email} will be signed out and will not be able to sign in until you activate the account again.`,
      { title: 'Deactivate user?', confirmText: 'Deactivate', danger: true });
    if (!ok) return;
    await this.setStatus(u, false, 'User deactivated.');
  }

  protected activate(u: UserDto) { return this.setStatus(u, true, 'User activated.'); }

  private async setStatus(u: UserDto, active: boolean, message: string) {
    try { await this.access.setUserStatus(u.id, active); this.toast.success(message); await this.load(); }
    catch (e) { this.toast.error(ApiService.message(e)); }
  }
}
