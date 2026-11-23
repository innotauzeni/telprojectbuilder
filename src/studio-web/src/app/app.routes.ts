import { Routes } from '@angular/router';
import { ProjectsPage } from './pages/projects';
import { DesignerPage } from './pages/designer';
import { PreviewPage } from './pages/preview';

export const routes: Routes = [
  { path: '', component: ProjectsPage, pathMatch: 'full' },
  { path: 'designer/:id', component: DesignerPage },
  { path: 'preview/:id', component: PreviewPage },
  { path: '**', redirectTo: '' }
];
