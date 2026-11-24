import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';
import { LoginPage } from './pages/login';
import { HomePage } from './pages/home';
import { EntityListPage } from './pages/entity-list';
import { EntityFormPage } from './pages/entity-form';
import { MenuAdminPage } from './pages/menu-admin';
import { ModulesPage } from './pages/access/modules';
import { ModuleDetailPage } from './pages/access/module-detail';
import { ModuleRolesPage } from './pages/access/module-roles';
import { SubmoduleDetailPage } from './pages/access/submodule-detail';
import { SubmoduleRolesPage } from './pages/access/submodule-roles';
import { RolesPage } from './pages/access/roles';
import { RoleDetailPage } from './pages/access/role-detail';
import { RoleAssignPage } from './pages/access/role-assign';
import { UsersPage } from './pages/access/users';

export const routes: Routes = [
  { path: 'login', component: LoginPage },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', component: HomePage, pathMatch: 'full' },
      { path: 'e/:entity', component: EntityListPage },
      { path: 'e/:entity/new', component: EntityFormPage },
      { path: 'e/:entity/:id', component: EntityFormPage },
      // Administration (Admins only): simple menu editor, or modules / sub-modules / roles when the system has access control
      { path: 'admin/menu', component: MenuAdminPage, canActivate: [adminGuard] },
      { path: 'admin/modules', component: ModulesPage, canActivate: [adminGuard] },
      { path: 'admin/modules/:id', component: ModuleDetailPage, canActivate: [adminGuard] },
      { path: 'admin/modules/:id/menu-permission', component: ModuleRolesPage, canActivate: [adminGuard] },
      { path: 'admin/submodules/:id', component: SubmoduleDetailPage, canActivate: [adminGuard] },
      { path: 'admin/submodules/:id/role-permission', component: SubmoduleRolesPage, canActivate: [adminGuard] },
      { path: 'admin/roles', component: RolesPage, canActivate: [adminGuard] },
      { path: 'admin/roles/:id', component: RoleDetailPage, canActivate: [adminGuard] },
      { path: 'admin/roles/:id/assign', component: RoleAssignPage, canActivate: [adminGuard] },
      { path: 'admin/users', component: UsersPage, canActivate: [adminGuard] }
    ]
  },
  { path: '**', redirectTo: '' }
];
