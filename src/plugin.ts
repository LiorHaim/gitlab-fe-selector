import { createPlugin } from '@backstage/core-plugin-api';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { GitLabGroupPicker } from './components/GitLabGroupPicker';
import { parseRepoUrl } from './utils/gitlab';

export const gitlabFeSelectorPlugin = createPlugin({
  id: 'gitlab-fe-selector',
});

export const GitLabGroupPickerFieldExtension = gitlabFeSelectorPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GitLabGroupPicker',
    component: GitLabGroupPicker,
    validation: (value, fieldValidation) => {
      if (!value) {
        fieldValidation.addError(
          'Please select a GitLab group and repository.',
        );
        return;
      }
      if (typeof value === 'string' && !parseRepoUrl(value)) {
        fieldValidation.addError('Invalid repository selection format.');
      }
    },
  }),
);

export default gitlabFeSelectorPlugin;
