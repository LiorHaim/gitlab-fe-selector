# RHDH Dynamic Plugin Development
## Presentation Slides Outline

Copy these into your presentation tool (PowerPoint, Google Slides, etc.)

---

## SLIDE 1: Title

**Developing Dynamic Plugins for Red Hat Developer Hub**

*Building a GitLab Group Picker as a Scaffolder Field Extension*

Your Name | Date

---

## SLIDE 2: Agenda

1. What are Dynamic Plugins?
2. Project Structure
3. Core Concepts
4. Authentication Patterns
5. Build & Package
6. Deployment
7. Live Demo
8. Lessons Learned

---

## SLIDE 3: What are Dynamic Plugins?

**Traditional Backstage:**
- Plugins compiled into the main app
- Requires rebuild & redeploy for changes

**RHDH Dynamic Plugins:**
- Loaded at runtime
- No rebuild of main app needed
- Hot-swappable
- Distributed as `.tgz` or OCI images

---

## SLIDE 4: What We're Building

**GitLab Group Picker**
- Custom Scaffolder form field
- Shows only groups where user is Owner
- Uses user's OAuth token
- Integrates with template steps

*[Screenshot of the picker in action]*

---

## SLIDE 5: Project Structure

```
gitlab-fe-selector/
├── src/
│   ├── index.ts              # 1 line
│   ├── plugin.ts             # 14 lines
│   └── components/
│       └── GitLabGroupPicker.tsx
├── package.json
└── tsconfig.json
```

**Only 3 source files needed!**

---

## SLIDE 6: package.json - Key Settings

```json
{
  "backstage": {
    "role": "frontend-plugin"
  },
  "scripts": {
    "build": "rhdh-cli plugin export",
    "package": "rhdh-cli plugin package ..."
  }
}
```

⚠️ `backstage.role` is **required**

---

## SLIDE 7: Core Concept - Plugin Registration

```typescript
// plugin.ts
import { createPlugin } from '@backstage/core-plugin-api';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

export const myPlugin = createPlugin({
  id: 'my-plugin',
});

export const MyFieldExtension = myPlugin.provide(
  createScaffolderFieldExtension({
    name: 'MyField',
    component: MyComponent,
  }),
);
```

---

## SLIDE 8: Core Concept - Entry Point

```typescript
// index.ts
export { myPlugin, MyFieldExtension } from './plugin';
```

**That's it - one line!**

The export name becomes `importName` in config.

---

## SLIDE 9: Component Props

```typescript
interface Props {
  onChange: (value: string) => void;  // Update form
  rawErrors?: string[];               // Validation
  formData?: string;                  // Current value
  uiSchema?: {                        // Template options
    'ui:options'?: { ... };
  };
}
```

Scaffolder provides these automatically.

---

## SLIDE 10: Authentication - Getting OAuth Token

```typescript
const response = await fetch(
  '/api/auth/gitlab/refresh?env=development', 
  {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest'  // Required!
    }
  }
);

const { providerInfo } = await response.json();
const token = providerInfo.accessToken;
```

---

## SLIDE 11: Authentication - Key Points

| Aspect | Detail |
|--------|--------|
| Endpoint | `/api/auth/{provider}/refresh` |
| Environment | `?env=development` or `production` |
| Required Header | `X-Requested-With: XMLHttpRequest` |
| Token Location | `response.providerInfo.accessToken` |
| Scope | `response.providerInfo.scope` |

---

## SLIDE 12: Calling External APIs

```typescript
const response = await fetch(
  `https://gitlab.com/api/v4/groups?min_access_level=50`,
  {
    headers: { 
      Authorization: `Bearer ${token}` 
    }
  }
);
```

Use the OAuth token from RHDH auth backend.

---

## SLIDE 13: Build & Package Options

**Option A: Tarball**
```bash
npm run build
npm run package
# Creates: my-plugin-dynamic-1.0.0.tgz
```

**Option B: OCI Image**
```bash
npm run build
npx rhdh-cli plugin package \
  --tag quay.io/user/plugin:1.0.0
podman push quay.io/user/plugin:1.0.0
```

---

## SLIDE 14: Deployment - dynamic-plugins.yaml

```yaml
plugins:
  - package: ./local-plugins/plugin-1.0.0.tgz
    # OR: oci://quay.io/user/plugin:1.0.0!plugin
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          my-plugin:
            scaffolderFieldExtensions:
              - importName: MyFieldExtension
```

---

## SLIDE 15: Backend Config - app-config.yaml

```yaml
auth:
  providers:
    gitlab:
      development:
        clientId: ${CLIENT_ID}
        clientSecret: ${CLIENT_SECRET}
        additionalScopes:    # Often required!
          - read_api
          - read_repository
```

Frontend plugins often need backend config too.

---

## SLIDE 16: Using in Templates

```yaml
properties:
  repoUrl:
    title: Repository
    type: string
    ui:field: GitLabGroupPicker
    ui:options:
      allowedHosts:
        - gitlab.example.com
      requestUserCredentials:
        secretsKey: USER_OAUTH_TOKEN
```

---

## SLIDE 17: Live Demo

1. Show source files
2. Run build command
3. Show generated artifacts
4. Walk through RHDH config
5. Use the picker in a template
6. Show the selected value

---

## SLIDE 18: Lessons Learned

| Challenge | Solution |
|-----------|----------|
| OAuth scope errors | Configure `additionalScopes` |
| 401 on auth calls | Add `X-Requested-With` header |
| Plugin not loading | Check `backstage.role` |
| Stale cache | Bump version number |
| Missing imports | Check `importName` matches export |

---

## SLIDE 19: Key Takeaways

✅ Minimal code required (3 source files)

✅ `rhdh-cli` handles all build complexity

✅ Two packaging options: tarball or OCI

✅ Authentication via RHDH auth backend

✅ Document backend requirements!

---

## SLIDE 20: Resources

- **This Plugin:** github.com/LiorHaim/gitlab-fe-selector
- **RHDH Docs:** docs.redhat.com/en/documentation/red_hat_developer_hub
- **Backstage Docs:** backstage.io/docs/plugins

---

## SLIDE 21: Q&A

**Questions?**

*Contact info / social links*

---

## Speaker Notes

### For Slide 6 (package.json):
"The `backstage.role` field is critical - without it, the rhdh-cli won't know how to package your plugin. For frontend plugins, always set it to `frontend-plugin`."

### For Slide 10 (Authentication):
"This was one of our biggest challenges. The `X-Requested-With` header is a security requirement from Backstage - without it, you'll get 401 errors even if everything else is correct."

### For Slide 15 (Backend Config):
"Don't forget the backend! We spent hours debugging why our token couldn't list GitLab groups. Turns out the OAuth token only had `read_user` scope. Adding `additionalScopes` in the auth config fixed it."

### For Demo:
"Notice how we only see groups where I'm an owner. That's the `min_access_level=50` filter in action. This is the core value-add of our plugin over the standard RepoUrlPicker."

