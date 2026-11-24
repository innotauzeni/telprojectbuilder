import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { AccountPage } from './pages/account';
import { ProjectsPage } from './pages/projects';
import { DesignerPage } from './pages/designer';
import { PreviewPage } from './pages/preview';

export const routes: Routes = [
  { path: 'login', component: AccountPage, data: { mode: 'login' } },
  { path: 'register', component: AccountPage, data: { mode: 'register' } },
  { path: '', component: ProjectsPage, pathMatch: 'full', canActivate: [authGuard] },
  { path: 'designer/:id', component: DesignerPage, canActivate: [authGuard] },
  { path: 'preview/:id', component: PreviewPage, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
