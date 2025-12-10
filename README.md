# GitLab Group Picker Plugin for RHDH

A frontend dynamic plugin for Red Hat Developer Hub (RHDH) 1.8+ that provides a Scaffolder Field Extension for selecting GitLab groups and repositories.

**Key Feature:** Only shows GitLab groups where the authenticated user has **Owner** access (`min_access_level=50`).

## Prerequisites

- Red Hat Developer Hub 1.8+
- GitLab instance (SaaS or Self-Hosted)
- GitLab OAuth authentication configured in RHDH

## Installation

### 1. Build the Plugin

```bash
npm install
npm run build
```

### 2. Choose Your Packaging Method

<details>
<summary><b>Option A: Tarball (.tgz)</b></summary>

#### Package as Tarball

```bash
npm run package
```

This generates `gitlab-fe-selector-dynamic-1.1.1.tgz` in the project root.

#### Deploy

Host the `.tgz` file on a web server or copy it to a location accessible by RHDH.

#### Configure dynamic-plugins.yaml

```yaml
plugins:
  - package: ./local-plugins/gitlab-fe-selector-dynamic-1.1.1.tgz
    # OR remote URL:
    # package: https://your-server.com/gitlab-fe-selector-dynamic-1.1.1.tgz
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          gitlab-fe-selector:
            scaffolderFieldExtensions:
              - importName: GitLabGroupPickerFieldExtension
```

</details>

<details>
<summary><b>Option B: OCI Image</b></summary>

#### Package as OCI Image

```bash
# Using Podman (default)
npx rhdh-cli plugin package --tag quay.io/YOUR_USERNAME/gitlab-fe-selector:1.1.1

# Using Docker
npx rhdh-cli plugin package --tag quay.io/YOUR_USERNAME/gitlab-fe-selector:1.1.1 --container-tool docker
```

#### Push to Registry

```bash
# Login to your registry
podman login quay.io
# or: docker login quay.io

# Push the image
podman push quay.io/YOUR_USERNAME/gitlab-fe-selector:1.1.1
# or: docker push quay.io/YOUR_USERNAME/gitlab-fe-selector:1.1.1
```

#### Configure dynamic-plugins.yaml

```yaml
plugins:
  - package: oci://quay.io/YOUR_USERNAME/gitlab-fe-selector:1.1.1!gitlab-fe-selector
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          gitlab-fe-selector:
            scaffolderFieldExtensions:
              - importName: GitLabGroupPickerFieldExtension
```

#### OCI Packaging Options

| Option | Description |
|--------|-------------|
| `-t, --tag <tag>` | **Required** - Image tag (e.g., `quay.io/user/plugin:1.0.0`) |
| `--container-tool <tool>` | `podman` (default), `docker`, or `buildah` |
| `--platform <platform>` | Target platform (default: `linux/amd64`) |
| `--force-export` | Rebuild `dist-dynamic` even if it exists |

</details>

## Required Configuration

### app-config.yaml

The GitLab OAuth provider **must** include `read_api` scope for this plugin to work:

```yaml
auth:
  environment: development
  providers:
    gitlab:
      development:
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

## How it Works

1. **Authentication Check** - Fetches the user's GitLab OAuth token from RHDH auth backend
2. **Scope Validation** - Verifies the token has `read_api` or `api` scope
3. **Group Selection** - Lists groups where user has Owner access (`min_access_level=50`)
4. **Repository Selection** - Lists projects within the selected group
5. **Token Passthrough** - The `requestUserCredentials` option captures the token for use in template steps

## Troubleshooting

### "Additional Permissions Required" Error

The OAuth token doesn't have `read_api` scope. Fix:

1. Add `additionalScopes: [read_api]` to `app-config.yaml` (see above)
2. Restart RHDH
3. Have users revoke the app in GitLab: `https://gitlab.example.com/-/profile/applications`
4. Users re-authenticate via RHDH

### "GitLab Authentication Required"

- Ensure user is logged in via GitLab (RHDH sidebar)
- Verify GitLab auth provider is configured in `app-config.yaml`

### No Groups Shown

- User may not have Owner access to any GitLab groups
- Verify `allowedHosts` matches the GitLab instance in `app-config.yaml`

## License

Apache-2.0
