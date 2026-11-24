import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

export interface ModuleDto {
  id: number; name: string; slugname: string; icon: string; description?: string | null; accessName?: string | null;
  sortOrder: number; isActive: boolean; submoduleCount: number; roleCount: number;
}
export interface ModuleInput {
  name: string; slugname: string; icon: string; description: string; accessName: string; sortOrder: number; isActive: boolean;
}
export interface SubmoduleDto {
  id: number; moduleId: number; name: string; icon: string; route: string; accessName: string; order: number; isActive: boolean; permissionCount: number;
}
export interface SubmoduleInput { name: string; icon: string; route: string; accessName: string; order: number; isActive: boolean; }
export interface PermissionDto { id: number; name: string; displayName: string; module: string; isActive: boolean; roleCount: number; }
export interface BulkResult { created: PermissionDto[]; skipped: string[]; }
export interface RoleDto {
  id: string; name: string; type?: string | null; level?: string | null; builtIn: boolean; userCount: number; menuIds: number[]; permissionIds: number[];
}
export interface RoleInput { name: string; type: string; level: string; }
export interface TreePermission { id: number; name: string; displayName: string; }
export interface TreeSubmodule { id: number; name: string; route: string; accessName: string; permissions: TreePermission[]; }
export interface TreeModule { id: number; name: string; icon: string; submodules: TreeSubmodule[]; }
export interface AccessTree { modules: TreeModule[]; other: TreePermission[]; }

/** Typed client for the access-control admin API (modules, sub-modules, permissions, roles). */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private u(path: string) { return this.config.apiBaseUrl + path; }

  // modules (menu)
  modules() { return firstValueFrom(this.http.get<ModuleDto[]>(this.u('/modules'))); }
  module(id: number) { return firstValueFrom(this.http.get<ModuleDto>(this.u(`/modules/${id}`))); }
  createModule(m: ModuleInput) { return firstValueFrom(this.http.post<ModuleDto>(this.u('/modules'), m)); }
  updateModule(id: number, m: ModuleInput) { return firstValueFrom(this.http.put<void>(this.u(`/modules/${id}`), m)); }
  deleteModule(id: number) { return firstValueFrom(this.http.delete<void>(this.u(`/modules/${id}`))); }
  moduleRoles(id: number) { return firstValueFrom(this.http.get<string[]>(this.u(`/modules/${id}/roles`))); }
  setModuleRoles(id: number, roleIds: string[]) { return firstValueFrom(this.http.put<void>(this.u(`/modules/${id}/roles`), { roleIds })); }

  // sub-modules (submenu)
  submodules(moduleId: number) { return firstValueFrom(this.http.get<SubmoduleDto[]>(this.u(`/modules/${moduleId}/submodules`))); }
  submodule(id: number) { return firstValueFrom(this.http.get<SubmoduleDto>(this.u(`/submodules/${id}`))); }
  createSubmodule(moduleId: number, s: SubmoduleInput) { return firstValueFrom(this.http.post<SubmoduleDto>(this.u(`/modules/${moduleId}/submodules`), s)); }
  updateSubmodule(id: number, s: SubmoduleInput) { return firstValueFrom(this.http.put<void>(this.u(`/submodules/${id}`), s)); }
  deleteSubmodule(id: number) { return firstValueFrom(this.http.delete<void>(this.u(`/submodules/${id}`))); }

  // permissions
  permissions(subId: number) { return firstValueFrom(this.http.get<PermissionDto[]>(this.u(`/submodules/${subId}/permissions`))); }
  createPermission(subId: number, p: { name: string; displayName: string; isActive: boolean }) {
    return firstValueFrom(this.http.post<PermissionDto>(this.u(`/submodules/${subId}/permissions`), p));
  }
  bulkPermissions(subId: number, names: string[]) { return firstValueFrom(this.http.post<BulkResult>(this.u(`/submodules/${subId}/permissions/bulk`), { names })); }
  updatePermission(id: number, p: { name: string; displayName: string; isActive: boolean }) { return firstValueFrom(this.http.put<void>(this.u(`/permissions/${id}`), p)); }
  deletePermission(id: number) { return firstValueFrom(this.http.delete<void>(this.u(`/permissions/${id}`))); }
  tree() { return firstValueFrom(this.http.get<AccessTree>(this.u('/access-tree'))); }

  // roles
  roles() { return firstValueFrom(this.http.get<RoleDto[]>(this.u('/roles'))); }
  role(id: string) { return firstValueFrom(this.http.get<RoleDto>(this.u(`/roles/${id}`))); }
  createRole(r: RoleInput) { return firstValueFrom(this.http.post<RoleDto>(this.u('/roles'), r)); }
  updateRole(id: string, r: RoleInput) { return firstValueFrom(this.http.put<void>(this.u(`/roles/${id}`), r)); }
  deleteRole(id: string) { return firstValueFrom(this.http.delete<void>(this.u(`/roles/${id}`))); }
  setRoleMenus(id: string, moduleIds: number[]) { return firstValueFrom(this.http.put<void>(this.u(`/roles/${id}/menus`), { moduleIds })); }
  setRolePermissions(id: string, permissionIds: number[]) { return firstValueFrom(this.http.put<void>(this.u(`/roles/${id}/permissions`), { permissionIds })); }
}
