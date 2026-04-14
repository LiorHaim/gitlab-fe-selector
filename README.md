# GitLab Group Picker — RHDH Dynamic Plugin

A frontend dynamic plugin for Red Hat Developer Hub (RHDH) 1.8+ that provides a **Scaffolder Field Extension** for selecting GitLab groups and repositories. Only shows groups where the authenticated user has **Owner** access (`min_access_level=50`).

## Key Features

- Owner-scoped group listing with full pagination
- OAuth token passthrough to downstream scaffolder steps (`publish:gitlab`)
- Multi-environment auth probe (`development` → `production` → `staging` → `default`)
- Scope validation with actionable error messages
- State restoration when navigating back in the scaffolder wizard
- Input validation and host sanitization

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Installation & Deployment](#installation--deployment)
- [Required Configuration](#required-configuration)
- [Usage in Scaffolder Templates](#usage-in-scaffolder-templates)
- [How It Works](#how-it-works)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)
- [License](#license)

## Tech Stack

- **Language:** TypeScript 5 (strict mode, ES2021 target)
- **Framework:** React 17/18 with Backstage Plugin API
- **UI Components:** Material UI v4 (`@material-ui/core`, `@material-ui/lab`)
- **Plugin System:** Backstage `createPlugin` + `createScaffolderFieldExtension`
- **Dynamic Loading:** Scalprum (via `@red-hat-developer-hub/cli`)
- **Testing:** Jest 29 + ts-jest + Testing Library
- **Linting:** ESLint with `@typescript-eslint`
- **Package Manager:** npm (no monorepo, no Yarn)
- **License:** Apache-2.0

## Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher
- **Podman** or **Docker** (for OCI image packaging)
- A running **RHDH 1.8+** instance with GitLab OAuth configured

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/LiorHaim/gitlab-fe-selector.git
cd gitlab-fe-selector
```

### 2. Install Dependencies

```bash
npm install --legacy-peer-deps
```

The `--legacy-peer-deps` flag is needed because `@backstage/*` packages have strict peer dependency trees.

### 3. Build

```bash
npm run build
```

This runs `tsc --build` and compiles TypeScript to the `dist/` directory.

### 4. Run Tests

```bash
npm test
```

Runs all 50 tests (utility functions + React component smoke tests) via Jest with jsdom.

### 5. Lint

```bash
npm run lint
```

Runs ESLint with TypeScript-aware rules against all `src/**/*.{ts,tsx}` files.

### 6. Typecheck

```bash
npm run typecheck
```

Runs `tsc --noEmit` to validate types without emitting output.

## Architecture

### Source Layout

```
src/
├── index.ts                         # Re-exports plugin + field extension
├── plugin.ts                        # createPlugin + createScaffolderFieldExtension
├── components/
│   └── GitLabGroupPicker.tsx        # Main UI component (Autocomplete selectors)
├── hooks/
│   └── useGitLabAuth.ts             # OAuth token acquisition hook
├── utils/
│   └── gitlab.ts                    # Types, validators, fetchAllPages, URL builders
└── __tests__/
    ├── gitlab.test.ts               # Unit tests for utils/gitlab.ts (40 tests)
    └── GitLabGroupPicker.test.tsx   # Component smoke tests (10 tests)
```

### Request Flow

```
User opens Scaffolder Template
        │
        ▼
┌─────────────────────┐
│   useGitLabAuth()   │ ──► /api/auth/gitlab/refresh?env=development
│                     │ ──► /api/auth/gitlab/refresh?env=production
│   (probes envs)     │ ──► /api/auth/gitlab/refresh?env=staging
│                     │ ──► /api/auth/gitlab/refresh?env=default
└────────┬────────────┘
         │ token + scope
         ▼
┌─────────────────────┐
│  GitLabGroupPicker  │
│                     │
│  1. Validate scope  │ ──► Checks for read_api or api
│  2. Fetch groups    │ ──► GET https://{host}/api/v4/groups?min_access_level=50
│  3. Fetch projects  │ ──► GET https://{host}/api/v4/groups/{id}/projects
│  4. Set secrets     │ ──► useTemplateSecrets().setSecrets({ key: token })
│  5. Emit value      │ ──► onChange("host?owner=group&repo=name")
└─────────────────────┘
```

### Key Design Decisions

- **Direct browser fetch** — API calls go directly from the browser to the GitLab instance using the user's OAuth token. No backend proxy or plugin backend is needed.
- **Repo URL encoding** — The output format `host?owner=<group>&repo=<name>` is compatible with Backstage's `publish:gitlab` action (not a standard HTTPS URL).
- **Input validation** — `isValidHost` rejects path traversal, query injection, and other malicious host values. `isValidSecretsKey` blocks prototype pollution vectors.
- **Rate limit resilience** — `fetchAllPages` retries up to 3 times on HTTP 429, respecting the `Retry-After` header (capped at 10 seconds).

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run all 50 tests via Jest |
| `npm run lint` | Run ESLint on source files |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run typecheck` | Type-check without emitting |
| `npm run export-dynamic` | Export Scalprum bundles to `dist-dynamic/` via rhdh-cli |
| `npm run package` | Full pipeline: build → export → `npm pack` tarball |
| `npm run clean` | Remove `dist/`, `dist-dynamic/`, `dist-pkg/` |

## Testing

### Test Suites

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| Utility functions | `src/__tests__/gitlab.test.ts` | 40 | `hasRequiredScope`, `buildRepoUrl`, `parseRepoUrl`, `fetchAllPages`, `isValidHost`, `isValidSecretsKey`, `AUTH_ENVIRONMENTS` |
| Component states | `src/__tests__/GitLabGroupPicker.test.tsx` | 10 | Auth loading, sign-in prompt, error display, scope warning, happy path, disabled picker, validation errors, invalid host, custom host |

### Running Tests

```bash
# All tests
npm test

# Verbose output
npm test -- --verbose

# Single file
npx jest src/__tests__/gitlab.test.ts

# Watch mode
npx jest --watch
```

### Test Configuration

- **Runner:** Jest 29 with ts-jest preset
- **Environment:** jsdom
- **Config:** `jest.config.js`

## Installation & Deployment

### Option A: OCI Image (Recommended for RHDH 1.9+)

A pre-built OCI image is available on quay.io:

```
quay.io/rh_ee_lhaim/plugin-gitlab-fe-selector:1.4.0
quay.io/rh_ee_lhaim/plugin-gitlab-fe-selector:latest
```

Configure in `dynamic-plugins.yaml`:

```yaml
plugins:
  - package: oci://quay.io/rh_ee_lhaim/plugin-gitlab-fe-selector:1.4.0!gitlab-fe-selector
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          gitlab-fe-selector:
            scaffolderFieldExtensions:
              - importName: GitLabGroupPickerFieldExtension
```

#### Building Your Own OCI Image

```bash
# Build and export
npm run build
npm run export-dynamic

# Package as OCI image (requires podman or docker)
npx @red-hat-developer-hub/cli@latest plugin package \
  --tag quay.io/YOUR_ORG/plugin-gitlab-fe-selector:1.4.0

# Push to registry
podman push quay.io/YOUR_ORG/plugin-gitlab-fe-selector:1.4.0
```

#### OCI Packaging Options

| Option | Description |
|--------|-------------|
| `-t, --tag <tag>` | **Required** — Image tag (e.g., `quay.io/user/plugin:1.0.0`) |
| `--container-tool <tool>` | `podman` (default), `docker`, or `buildah` |
| `--platform <platform>` | Target platform (default: `linux/amd64`) |
| `--force-export` | Rebuild `dist-dynamic` even if it exists |

### Option B: Tarball (.tgz)

```bash
# Full build + export + pack pipeline
npm run package
```

This generates `gitlab-fe-selector-dynamic-1.4.0.tgz` in the project root.

Configure in `dynamic-plugins.yaml`:

```yaml
plugins:
  - package: ./local-plugins/gitlab-fe-selector-dynamic-1.4.0.tgz
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          gitlab-fe-selector:
            scaffolderFieldExtensions:
              - importName: GitLabGroupPickerFieldExtension
```

## Required Configuration

### app-config.yaml

The GitLab OAuth provider **must** include `read_api` scope:

```yaml
auth:
  environment: development  # See "Auth Environment Detection" below
  providers:
    gitlab:
      development:  # Must match auth.environment value
        clientId: ${AUTH_GITLAB_CLIENT_ID}
        clientSecret: ${AUTH_GITLAB_CLIENT_SECRET}
        audience: https://gitlab.example.com
        ## REQUIRED: read_api scope is needed to list groups ##
        additionalScopes:
          - read_api
        signIn:
          resolvers:
            - resolver: emailMatchingUserEntityProfileEmail

integrations:
  gitlab:
    - host: gitlab.example.com
      apiBaseUrl: https://gitlab.example.com/api/v4
      token: ${GITLAB_TOKEN}
```

> **Important:** After adding `additionalScopes`, users must revoke the existing RHDH/Backstage app in GitLab (User Settings → Applications) and re-authenticate to get a token with the new scopes.

## Usage in Scaffolder Templates

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: create-app
  title: Create Application
spec:
  parameters:
    - title: Choose Repository
      required:
        - repoUrl
      properties:
        repoUrl:
          title: Repository Location
          type: string
          ui:field: GitLabGroupPicker
          ui:options:
            allowedHosts:
              - gitlab.example.com
            requestUserCredentials:
              secretsKey: USER_OAUTH_TOKEN
  steps:
    - id: publish
      name: Publish to GitLab
      action: publish:gitlab
      input:
        repoUrl: ${{ parameters.repoUrl }}
        token: ${{ secrets.USER_OAUTH_TOKEN }}
```

### Template Options

| Option | Description |
|--------|-------------|
| `allowedHosts` | Array of allowed GitLab hosts. First host is used for API calls. Default: `gitlab.com` |
| `requestUserCredentials.secretsKey` | Key name for storing the user's OAuth token (used by backend steps) |

## How It Works

1. **Authentication Check** — Probes the RHDH auth backend for a GitLab OAuth token across multiple environment names
2. **Scope Validation** — Verifies the token has `read_api` or `api` scope; shows actionable guidance if not
3. **Host Validation** — Validates the configured `allowedHosts` value against injection attacks
4. **Group Selection** — Lists all groups where the user has Owner access, with full pagination
5. **Repository Selection** — Lists projects within the selected group
6. **Token Passthrough** — The `requestUserCredentials` option stores the token via `setSecrets` for downstream scaffolder steps

### Auth Environment Detection

The plugin automatically tries common auth environment names in order:

| Attempt | Environment Name |
|---------|------------------|
| 1st | `development` |
| 2nd | `production` |
| 3rd | `staging` |
| 4th | `default` |

> If your RHDH uses a different environment name, modify `AUTH_ENVIRONMENTS` in `src/utils/gitlab.ts` and rebuild.

## Environment Variables

This plugin runs entirely in the browser and has no server-side environment variables. All configuration is done through `app-config.yaml` and template YAML as documented above.

For **development**, no environment variables are needed — just `npm install` and `npm test`.

## Troubleshooting

### "Additional Permissions Required" Error

The OAuth token doesn't have `read_api` scope.

1. Add `additionalScopes: [read_api]` to `app-config.yaml` (see [Required Configuration](#required-configuration))
2. Restart RHDH
3. Have users revoke the app in GitLab: `https://gitlab.example.com/-/profile/applications`
4. Users re-authenticate via RHDH

### "GitLab Authentication Required"

- Ensure the user is logged in via GitLab (RHDH sidebar)
- Verify the GitLab auth provider is configured in `app-config.yaml`
- Check that `auth.environment` matches one of: `development`, `production`, `staging`, `default`

### "Invalid Host Configuration"

The `allowedHosts` value in the template YAML contains invalid characters (path separators, query strings, etc.). Fix the template to use a plain hostname like `gitlab.example.com`.

### No Groups Shown

- The user may not have Owner access to any GitLab groups
- Verify `allowedHosts` matches the GitLab instance configured in `app-config.yaml`

### Popup Blocked

If the sign-in popup is blocked, the plugin shows a message. Users need to allow popups for the RHDH domain in their browser settings.

### Rate Limiting (HTTP 429)

The plugin automatically retries up to 3 times with the server's `Retry-After` delay (capped at 10 seconds). If retries are exhausted, an error is shown. This typically indicates heavy GitLab API usage — wait a moment and retry.

## Changelog

### 1.4.0

- Add input validation for host (`isValidHost`) and secrets key (`isValidSecretsKey`)
- Add retry loop with up to 3 retries on HTTP 429 rate limiting
- Cap `Retry-After` delay at 10s for better UX in browser context
- Fix `parseRepoUrl` to preserve query values containing encoded question marks
- URL-encode `selectedGroup.id` in projects fetch URL
- Prevent stacking popup polling intervals on rapid sign-in clicks
- Add `console.warn` when `formData` group restoration fails
- Add ESLint with `@typescript-eslint` for static analysis
- Add 10 React component smoke tests covering all render states
- Bump test count from 25 to 50
- OCI image: `quay.io/rh_ee_lhaim/plugin-gitlab-fe-selector:1.4.0`

### 1.3.2

- Fix OCI packaging — use `rhdh-cli plugin package` instead of manual Containerfile

### 1.3.1

- Harden pagination, validation, accessibility, and error handling

### 1.3.0

- Align plugin packaging with RHDH best practices

### 1.2.0

- Full pagination for groups and repositories (no longer limited to first 100 results)
- State restoration when navigating back in the scaffolder wizard
- Field validation ensuring both group and repository are selected
- Repository fetch error reporting in the UI
- Unmount safety for the auth popup polling interval
- Extracted `useGitLabAuth` hook and shared utilities
- Added unit tests for all utility functions and pagination logic

## License

Apache-2.0
