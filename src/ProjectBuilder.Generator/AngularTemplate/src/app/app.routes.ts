import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { LoginPage } from './pages/login';
import { HomePage } from './pages/home';
import { EntityListPage } from './pages/entity-list';
import { EntityFormPage } from './pages/entity-form';
import { MenuAdminPage } from './pages/menu-admin';

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
      { path: 'admin/menu', component: MenuAdminPage }
    ]
  },
  { path: '**', redirectTo: '' }
];
