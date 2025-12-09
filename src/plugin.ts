import { createPlugin } from '@backstage/core-plugin-api';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { GitLabGroupPicker } from './components/GitLabGroupPicker';

export const gitlabFeSelectorPlugin = createPlugin({
  id: 'gitlab-fe-selector',
});

export const GitLabGroupPickerFieldExtension = gitlabFeSelectorPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GitLabGroupPicker',
    component: GitLabGroupPicker,
  }),
);

