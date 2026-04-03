import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  TextField,
  CircularProgress,
  FormControl,
  FormHelperText,
  Typography,
  Box,
  Button,
} from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import Alert from '@material-ui/lab/Alert';
import AlertTitle from '@material-ui/lab/AlertTitle';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import { useGitLabAuth } from '../hooks/useGitLabAuth';
import {
  GitLabGroup,
  GitLabProject,
  fetchAllPages,
  buildRepoUrl,
  parseRepoUrl,
} from '../utils/gitlab';

interface GitLabGroupPickerProps {
  onChange: (value: string) => void;
  rawErrors?: string[];
  formData?: string;
  uiSchema?: {
    'ui:options'?: {
      allowedHosts?: string[];
      requestUserCredentials?: {
        secretsKey: string;
        additionalScopes?: {
          gitlab?: string[];
        };
      };
    };
  };
}

export const GitLabGroupPicker = (props: GitLabGroupPickerProps) => {
  const { onChange, rawErrors, formData, uiSchema } = props;

  const allowedHosts = uiSchema?.['ui:options']?.allowedHosts;
  const host = allowedHosts?.[0] || 'gitlab.com';
  const secretsKey =
    uiSchema?.['ui:options']?.requestUserCredentials?.secretsKey;

  const { setSecrets } = useTemplateSecrets();

  const {
    token,
    tokenScope,
    needsAuth,
    insufficientScope,
    isLoading: authLoading,
    authError,
    handleSignIn,
    retryAuth,
  } = useGitLabAuth();

  const [selectedGroup, setSelectedGroup] = useState<GitLabGroup | null>(null);
  const [selectedProject, setSelectedProject] = useState<GitLabProject | null>(null);

  const [groups, setGroups] = useState<GitLabGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [errorGroups, setErrorGroups] = useState<Error | null>(null);

  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [errorProjects, setErrorProjects] = useState<Error | null>(null);

  const [retryKey, setRetryKey] = useState(0);
  const restoredRef = useRef(false);

  // Pass the user's OAuth token to scaffolder secrets so downstream steps
  // (e.g. publish:gitlab) can use it via ${{ secrets.<secretsKey> }}
  useEffect(() => {
    if (token && secretsKey) {
      setSecrets({ [secretsKey]: token });
    }
  }, [token, secretsKey, setSecrets]);

  const makeHeaders = useCallback(
    (): Record<string, string> =>
      token ? { Authorization: `Bearer ${token}` } : {},
    [token],
  );

  // Fetch all groups (paginated)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      setLoadingGroups(true);
      setErrorGroups(null);
      try {
        const all = await fetchAllPages<GitLabGroup>(
          `https://${host}/api/v4/groups?min_access_level=50`,
          makeHeaders(),
        );
        if (!cancelled) setGroups(all);
      } catch (err) {
        if (!cancelled)
          setErrorGroups(
            err instanceof Error ? err : new Error(String(err)),
          );
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [host, token, makeHeaders, retryKey]);

  // Fetch all projects for the selected group (paginated)
  useEffect(() => {
    if (!selectedGroup || !token) {
      setProjects([]);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoadingProjects(true);
      setErrorProjects(null);
      try {
        const all = await fetchAllPages<GitLabProject>(
          `https://${host}/api/v4/groups/${selectedGroup.id}/projects`,
          makeHeaders(),
        );
        if (!cancelled) setProjects(all);
      } catch (err) {
        if (!cancelled)
          setErrorProjects(
            err instanceof Error ? err : new Error(String(err)),
          );
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedGroup, host, token, makeHeaders]);

  // Restore group selection from formData (e.g. navigating back in scaffolder)
  useEffect(() => {
    if (restoredRef.current || !formData || groups.length === 0) return;
    const parsed = parseRepoUrl(formData);
    if (!parsed) return;

    const match = groups.find(g => g.full_path === parsed.owner);
    if (match) {
      restoredRef.current = true;
      setSelectedGroup(match);
    }
  }, [formData, groups]);

  // Restore project selection from formData once projects are loaded
  useEffect(() => {
    if (!formData || !selectedGroup || projects.length === 0 || selectedProject)
      return;
    const parsed = parseRepoUrl(formData);
    if (!parsed) return;

    const match = projects.find(
      p => p.path_with_namespace.split('/').pop() === parsed.repo,
    );
    if (match) {
      setSelectedProject(match);
    }
  }, [formData, selectedGroup, projects, selectedProject]);

  const handleGroupChange = (
    _event: React.ChangeEvent<{}>,
    newValue: GitLabGroup | null,
  ) => {
    setSelectedGroup(newValue);
    setSelectedProject(null);
    setProjects([]);
    setErrorProjects(null);
    onChange('');
  };

  const handleProjectChange = (
    _event: React.ChangeEvent<{}>,
    newValue: GitLabProject | null,
  ) => {
    setSelectedProject(newValue);
    if (newValue && selectedGroup) {
      const repoName = newValue.path_with_namespace.split('/').pop() || '';
      onChange(buildRepoUrl(host, selectedGroup.full_path, repoName));
    } else {
      onChange('');
    }
  };

  const retryGroups = useCallback(() => setRetryKey(k => k + 1), []);

  // --- Render states ---

  if (authLoading) {
    return (
      <Box p={2} display="flex" alignItems="center" role="status">
        <CircularProgress size={20} style={{ marginRight: 8 }} />
        <Typography variant="body2">
          Checking GitLab authentication...
        </Typography>
      </Box>
    );
  }

  if (needsAuth) {
    return (
      <Alert severity="info">
        <AlertTitle>GitLab Authentication Required</AlertTitle>
        <Typography variant="body2" gutterBottom>
          Please sign in to GitLab to select a repository.
        </Typography>
        <Box mt={1}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSignIn}
            size="small"
            style={{ marginRight: 8 }}
          >
            Sign in to GitLab
          </Button>
          <Button variant="outlined" onClick={retryAuth} size="small">
            Retry
          </Button>
        </Box>
        {authError && (
          <Typography
            color="error"
            variant="caption"
            display="block"
            style={{ marginTop: 8 }}
          >
            {authError}
          </Typography>
        )}
      </Alert>
    );
  }

  if (insufficientScope) {
    return (
      <Alert severity="warning">
        <AlertTitle>Additional Permissions Required</AlertTitle>
        <Typography variant="body2" gutterBottom>
          Your GitLab token has <code>{tokenScope}</code> scope, but{' '}
          <code>read_api</code> is required.
        </Typography>
        <Typography variant="body2" gutterBottom style={{ marginTop: 8 }}>
          Please ask your administrator to add <code>read_api</code> to the
          GitLab OAuth scopes in <code>app-config.yaml</code>:
        </Typography>
        <Box
          component="pre"
          style={{
            backgroundColor: 'rgba(0,0,0,0.04)',
            padding: 8,
            borderRadius: 4,
            fontSize: '0.85em',
            overflow: 'auto',
          }}
        >
          {`auth:
  providers:
    gitlab:
      development:
        additionalScopes:
          - read_api`}
        </Box>
        <Typography variant="body2" gutterBottom style={{ marginTop: 8 }}>
          After the config is updated, revoke the app in{' '}
          <a
            href={`https://${host}/-/profile/applications`}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitLab Settings
          </a>{' '}
          and sign in again.
        </Typography>
        <Box mt={1}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSignIn}
            size="small"
            style={{ marginRight: 8 }}
          >
            Sign in to GitLab
          </Button>
          <Button variant="outlined" onClick={retryAuth} size="small">
            Retry
          </Button>
        </Box>
      </Alert>
    );
  }

  if (errorGroups) {
    return (
      <Alert
        severity="error"
        action={
          <Button variant="outlined" onClick={retryGroups} size="small">
            Retry
          </Button>
        }
      >
        <AlertTitle>Error Loading Groups</AlertTitle>
        {errorGroups.message}
      </Alert>
    );
  }

  return (
    <FormControl fullWidth error={rawErrors && rawErrors.length > 0}>
      <Autocomplete
        id="gitlab-group-picker"
        options={groups}
        getOptionLabel={option => option.full_path}
        loading={loadingGroups}
        value={selectedGroup}
        onChange={handleGroupChange}
        renderInput={params => (
          <TextField
            {...params}
            label="Select Group (Owner Access)"
            variant="outlined"
            margin="normal"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <React.Fragment>
                  {loadingGroups ? (
                    <CircularProgress color="inherit" size={20} />
                  ) : null}
                  {params.InputProps.endAdornment}
                </React.Fragment>
              ),
            }}
          />
        )}
      />

      <Autocomplete
        id="gitlab-project-picker"
        options={projects}
        getOptionLabel={option => option.name}
        loading={loadingProjects}
        value={selectedProject}
        onChange={handleProjectChange}
        disabled={!selectedGroup}
        renderInput={params => (
          <TextField
            {...params}
            label="Select Repository"
            variant="outlined"
            margin="normal"
            error={!!errorProjects}
            helperText={errorProjects?.message}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <React.Fragment>
                  {loadingProjects ? (
                    <CircularProgress color="inherit" size={20} />
                  ) : null}
                  {params.InputProps.endAdornment}
                </React.Fragment>
              ),
            }}
          />
        )}
      />

      {rawErrors && rawErrors.length > 0 && (
        <FormHelperText error>{rawErrors[0]}</FormHelperText>
      )}
    </FormControl>
  );
};
