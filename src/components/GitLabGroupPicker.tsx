import React, { useState, useEffect, useCallback } from 'react';
import { TextField, CircularProgress, FormControl, FormHelperText, Typography, Box, Button } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { useAsync } from 'react-use';

interface GitLabGroup {
  id: number;
  full_path: string;
  name: string;
}

interface GitLabProject {
  id: number;
  path_with_namespace: string;
  name: string;
  web_url: string;
}

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

// Required scopes for this plugin to work
const REQUIRED_SCOPES = ['read_api', 'api'];

// Check if token has sufficient scope
const hasRequiredScope = (tokenScope: string): boolean => {
  const scopes = tokenScope.split(' ');
  return REQUIRED_SCOPES.some(required => scopes.includes(required));
};

// Auth environments to try (in order of priority)
const AUTH_ENVIRONMENTS = ['development', 'production'];

export const GitLabGroupPicker = (props: GitLabGroupPickerProps) => {
  const { onChange, rawErrors, uiSchema } = props;
  
  const allowedHosts = uiSchema?.['ui:options']?.allowedHosts;
  const host = allowedHosts?.[0] || 'gitlab.com';
  
  const [selectedGroup, setSelectedGroup] = useState<GitLabGroup | null>(null);
  const [selectedProject, setSelectedProject] = useState<GitLabProject | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenScope, setTokenScope] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [insufficientScope, setInsufficientScope] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Try to get the GitLab token from the auth backend
  const fetchToken = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    setNeedsAuth(false);
    setInsufficientScope(false);
    setTokenScope(null);
    
    for (const env of AUTH_ENVIRONMENTS) {
      try {
        const response = await fetch(`/api/auth/gitlab/refresh?env=${env}`, { 
          credentials: 'include',
          headers: { 
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const accessToken = data.providerInfo?.accessToken;
          const scope = data.providerInfo?.scope || '';
          
          if (accessToken) {
            if (!hasRequiredScope(scope)) {
              setTokenScope(scope);
              setInsufficientScope(true);
              setIsLoading(false);
              return;
            }
            
            setToken(accessToken);
            setTokenScope(scope);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Continue to next environment
      }
    }
    
    setNeedsAuth(true);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Handle GitLab sign-in via OAuth popup
  const handleSignIn = useCallback(() => {
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    
    const popup = window.open(
      '/api/auth/gitlab/start?env=development',
      'GitLab Sign In',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    if (!popup) {
      setAuthError('Popup was blocked. Please allow popups for this site.');
      return;
    }
    
    const checkPopup = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkPopup);
        setTimeout(() => fetchToken(), 1000);
      }
    }, 500);
  }, [fetchToken]);

  const getHeaders = useCallback((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const { value: groups, loading: loadingGroups, error: errorGroups } = useAsync(async () => {
    if (!token) return [];
    const headers = getHeaders();
    const response = await fetch(`https://${host}/api/v4/groups?min_access_level=50&per_page=100`, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch groups: ${response.statusText}`);
    }
    return (await response.json()) as GitLabGroup[];
  }, [host, token, getHeaders]);

  const { value: projects, loading: loadingProjects } = useAsync(async () => {
    if (!selectedGroup || !token) return [];
    const headers = getHeaders();
    const response = await fetch(`https://${host}/api/v4/groups/${selectedGroup.id}/projects?per_page=100`, { headers });
    if (!response.ok) throw new Error(`Failed to fetch projects: ${response.statusText}`);
    return (await response.json()) as GitLabProject[];
  }, [selectedGroup, host, token, getHeaders]);

  const handleGroupChange = (_: any, newValue: GitLabGroup | null) => {
    setSelectedGroup(newValue);
    setSelectedProject(null);
    onChange(''); 
  };

  const handleProjectChange = (_: any, newValue: GitLabProject | null) => {
    setSelectedProject(newValue);
    if (newValue) {
      const repoName = newValue.path_with_namespace.split('/').pop() || '';
      const url = `${host}?owner=${encodeURIComponent(selectedGroup?.full_path || '')}&repo=${encodeURIComponent(repoName)}`;
      onChange(url);
    } else {
      onChange('');
    }
  };

  if (isLoading) {
    return (
      <Box p={2} display="flex" alignItems="center">
        <CircularProgress size={20} style={{ marginRight: 8 }} />
        <Typography variant="body2">Checking GitLab authentication...</Typography>
      </Box>
    );
  }

  if (needsAuth) {
    return (
      <Box p={2} style={{ border: '1px solid #ccc', borderRadius: 4, backgroundColor: '#f5f5f5' }}>
        <Typography variant="body1" gutterBottom>
          <strong>GitLab Authentication Required</strong>
        </Typography>
        <Typography variant="body2" gutterBottom>
          Please sign in to GitLab to select a repository.
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={handleSignIn}
          style={{ marginTop: 8, marginRight: 8 }}
        >
          Sign in to GitLab
        </Button>
        <Button 
          variant="outlined" 
          onClick={fetchToken}
          style={{ marginTop: 8 }}
        >
          Retry
        </Button>
        {authError && (
          <Typography color="error" variant="caption" display="block" style={{ marginTop: 8 }}>
            {authError}
          </Typography>
        )}
      </Box>
    );
  }

  if (insufficientScope) {
    return (
      <Box p={2} style={{ border: '1px solid #f0ad4e', borderRadius: 4, backgroundColor: '#fcf8e3' }}>
        <Typography variant="body1" gutterBottom style={{ color: '#8a6d3b' }}>
          <strong>Additional Permissions Required</strong>
        </Typography>
        <Typography variant="body2" gutterBottom>
          Your GitLab token has <code>{tokenScope}</code> scope, but <code>read_api</code> is required.
        </Typography>
        <Typography variant="body2" gutterBottom style={{ marginTop: 8 }}>
          Please ask your administrator to add <code>read_api</code> to the GitLab OAuth scopes in <code>app-config.yaml</code>:
        </Typography>
        <Box component="pre" style={{ 
          backgroundColor: '#fff', 
          padding: 8, 
          borderRadius: 4, 
          fontSize: '0.85em',
          overflow: 'auto'
        }}>
{`auth:
  providers:
    gitlab:
      development:
        additionalScopes:
          - read_api`}
        </Box>
        <Typography variant="body2" gutterBottom style={{ marginTop: 8 }}>
          After the config is updated, revoke the app in{' '}
          <a href={`https://${host}/-/profile/applications`} target="_blank" rel="noopener noreferrer">
            GitLab Settings
          </a>{' '}
          and sign in again.
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={handleSignIn}
          style={{ marginTop: 8, marginRight: 8 }}
        >
          Sign in to GitLab
        </Button>
        <Button 
          variant="outlined" 
          onClick={fetchToken}
          style={{ marginTop: 8 }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  if (errorGroups) {
    return (
      <Box p={2} style={{ border: '1px solid #d9534f', borderRadius: 4, backgroundColor: '#f2dede' }}>
        <Typography variant="body1" gutterBottom style={{ color: '#a94442' }}>
          <strong>Error Loading Groups</strong>
        </Typography>
        <Typography variant="body2" gutterBottom>
          {errorGroups.message}
        </Typography>
        <Button 
          variant="outlined" 
          onClick={fetchToken}
          style={{ marginTop: 8 }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <FormControl fullWidth error={rawErrors && rawErrors.length > 0}>
      <Autocomplete
        options={groups || []}
        getOptionLabel={(option) => option.full_path}
        loading={loadingGroups}
        value={selectedGroup}
        onChange={handleGroupChange}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select Group (Owner Access)"
            variant="outlined"
            margin="normal"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <React.Fragment>
                  {loadingGroups ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </React.Fragment>
              ),
            }}
          />
        )}
      />

      <Autocomplete
        options={projects || []}
        getOptionLabel={(option) => option.name}
        loading={loadingProjects}
        value={selectedProject}
        onChange={handleProjectChange}
        disabled={!selectedGroup}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select Repository"
            variant="outlined"
            margin="normal"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <React.Fragment>
                  {loadingProjects ? <CircularProgress color="inherit" size={20} /> : null}
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
