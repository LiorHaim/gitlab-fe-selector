# RHDH Dynamic Plugin Development Cheat Sheet

## Quick Reference

### Minimum Required Files

```
my-plugin/
├── src/
│   ├── index.ts        # Export your plugin
│   ├── plugin.ts       # Register plugin & extensions
│   └── components/     # Your React components
├── package.json        # Must have backstage.role
└── tsconfig.json       # TypeScript config
```

### package.json Essentials

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "src/index.ts",
  "backstage": {
    "role": "frontend-plugin"
  },
  "scripts": {
    "build": "rhdh-cli plugin export",
    "package": "rhdh-cli plugin package --export-to ./dist-pkg && cd dist-pkg/my-plugin && npm pack && mv *.tgz ../.."
  },
  "dependencies": {
    "@backstage/core-plugin-api": "^1.9.0",
    "@backstage/plugin-scaffolder-react": "^1.10.0",
    "@material-ui/core": "^4.12.4"
  },
  "devDependencies": {
    "@red-hat-developer-hub/cli": "*",
    "typescript": "^5.0.0"
  }
}
```

### Plugin Registration Pattern

```typescript
// src/plugin.ts
import { createPlugin } from '@backstage/core-plugin-api';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { MyComponent } from './components/MyComponent';

export const myPlugin = createPlugin({
  id: 'my-plugin',
});

export const MyFieldExtension = myPlugin.provide(
  createScaffolderFieldExtension({
    name: 'MyField',           // Used as ui:field in templates
    component: MyComponent,
  }),
);
```

```typescript
// src/index.ts
export { myPlugin, MyFieldExtension } from './plugin';
```

### Field Extension Component Props

```typescript
interface MyComponentProps {
  onChange: (value: string) => void;  // Required - updates form
  rawErrors?: string[];               // Validation errors
  formData?: string;                  // Current value
  uiSchema?: {
    'ui:options'?: {
      // Your custom options from template
    };
  };
}
```

---

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build plugin to `dist-dynamic/` |
| `npm run package` | Create `.tgz` tarball |
| `npx rhdh-cli plugin package --tag <image>` | Build OCI image |
| `npm run clean` | Remove build artifacts |

### OCI Image Build

```bash
# Build with podman (default)
npx rhdh-cli plugin package --tag quay.io/user/plugin:1.0.0

# Build with docker
npx rhdh-cli plugin package --tag quay.io/user/plugin:1.0.0 --container-tool docker

# Push to registry
podman push quay.io/user/plugin:1.0.0
```

---

## Deployment Configuration

### dynamic-plugins.yaml (Tarball)

```yaml
plugins:
  - package: ./local-plugins/my-plugin-dynamic-1.0.0.tgz
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          my-plugin:
            scaffolderFieldExtensions:
              - importName: MyFieldExtension
```

### dynamic-plugins.yaml (OCI)

```yaml
plugins:
  - package: oci://quay.io/user/my-plugin:1.0.0!my-plugin
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          my-plugin:
            scaffolderFieldExtensions:
              - importName: MyFieldExtension
```

---

## Authentication Patterns

### Fetch OAuth Token from RHDH

```typescript
const response = await fetch('/api/auth/gitlab/refresh?env=development', {
  credentials: 'include',
  headers: {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'  // Required!
  }
});

const data = await response.json();
const token = data.providerInfo?.accessToken;
const scope = data.providerInfo?.scope;
```

### OAuth Popup Flow

```typescript
const popup = window.open(
  '/api/auth/gitlab/start?env=development',
  'Sign In',
  'width=500,height=700'
);

// Poll for closure
const check = setInterval(() => {
  if (popup?.closed) {
    clearInterval(check);
    // Refresh token after popup closes
  }
}, 500);
```

---

## Template Usage

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: my-template
spec:
  parameters:
    - title: Step Title
      properties:
        myField:
          title: My Custom Field
          type: string
          ui:field: MyField          # Matches name in createScaffolderFieldExtension
          ui:options:
            customOption: value      # Passed to component via uiSchema
```

---

## Common Gotchas

| Issue | Solution |
|-------|----------|
| Plugin not loading | Check `backstage.role` in package.json |
| Field not appearing | Verify `importName` matches export name |
| Auth 401 errors | Add `X-Requested-With: XMLHttpRequest` header |
| Insufficient scope | Add `additionalScopes` in app-config.yaml |
| Cached old version | Bump version number in package.json |
| CORS errors | Use RHDH proxy or backend for external APIs |

---

## Useful Links

- [Backstage Plugin Development](https://backstage.io/docs/plugins/)
- [RHDH Dynamic Plugins](https://docs.redhat.com/en/documentation/red_hat_developer_hub/)
- [Scaffolder Field Extensions](https://backstage.io/docs/features/software-templates/writing-custom-field-extensions)

