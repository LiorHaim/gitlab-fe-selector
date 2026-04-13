import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GitLabGroupPicker } from '../components/GitLabGroupPicker';
import type { GitLabAuthState } from '../hooks/useGitLabAuth';

jest.mock('../hooks/useGitLabAuth');
jest.mock('@backstage/plugin-scaffolder-react', () => ({
  useTemplateSecrets: () => ({ setSecrets: jest.fn() }),
}));

import { useGitLabAuth } from '../hooks/useGitLabAuth';

const mockUseGitLabAuth = useGitLabAuth as jest.MockedFunction<
  typeof useGitLabAuth
>;

const baseAuthState: GitLabAuthState = {
  token: 'test-token',
  tokenScope: 'read_api',
  needsAuth: false,
  insufficientScope: false,
  isLoading: false,
  authError: null,
  authEnv: 'development',
  handleSignIn: jest.fn(),
  retryAuth: jest.fn(),
};

const originalFetch = global.fetch;

describe('GitLabGroupPicker', () => {
  const onChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGitLabAuth.mockReturnValue({ ...baseAuthState });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Headers(),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows loading state when auth is in progress', () => {
    mockUseGitLabAuth.mockReturnValue({
      ...baseAuthState,
      isLoading: true,
      token: null,
    });

    render(<GitLabGroupPicker onChange={onChange} />);
    expect(
      screen.getByText(/Checking GitLab authentication/),
    ).toBeInTheDocument();
  });

  it('shows sign-in prompt when authentication is needed', () => {
    mockUseGitLabAuth.mockReturnValue({
      ...baseAuthState,
      needsAuth: true,
      token: null,
    });

    render(<GitLabGroupPicker onChange={onChange} />);
    expect(
      screen.getByText(/GitLab Authentication Required/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sign in to GitLab/)).toBeInTheDocument();
  });

  it('shows auth error message when present', () => {
    mockUseGitLabAuth.mockReturnValue({
      ...baseAuthState,
      needsAuth: true,
      token: null,
      authError: 'Auth endpoint returned 500 for env "development"',
    });

    render(<GitLabGroupPicker onChange={onChange} />);
    expect(
      screen.getByText(/Auth endpoint returned 500/),
    ).toBeInTheDocument();
  });

  it('shows insufficient scope warning', () => {
    mockUseGitLabAuth.mockReturnValue({
      ...baseAuthState,
      insufficientScope: true,
      tokenScope: 'read_user',
      token: null,
    });

    render(<GitLabGroupPicker onChange={onChange} />);
    expect(
      screen.getByText(/Additional Permissions Required/),
    ).toBeInTheDocument();
    expect(screen.getByText(/read_user/)).toBeInTheDocument();
  });

  it('renders both autocomplete inputs when authenticated', async () => {
    await act(async () => {
      render(<GitLabGroupPicker onChange={onChange} />);
    });

    expect(
      screen.getByLabelText(/Select Group/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Select Repository/),
    ).toBeInTheDocument();
  });

  it('disables project picker when no group is selected', async () => {
    await act(async () => {
      render(<GitLabGroupPicker onChange={onChange} />);
    });

    const repoPicker = screen.getByLabelText(/Select Repository/);
    expect(repoPicker).toBeDisabled();
  });

  it('shows validation error from rawErrors', async () => {
    await act(async () => {
      render(
        <GitLabGroupPicker
          onChange={onChange}
          rawErrors={['Please select a GitLab group and repository.']}
        />,
      );
    });

    expect(
      screen.getByText(/Please select a GitLab group and repository/),
    ).toBeInTheDocument();
  });

  it('shows invalid host error for malicious host config', () => {
    render(
      <GitLabGroupPicker
        onChange={onChange}
        uiSchema={{
          'ui:options': {
            allowedHosts: ['evil.com/../../etc/passwd'],
          },
        }}
      />,
    );

    expect(
      screen.getByText(/Invalid Host Configuration/),
    ).toBeInTheDocument();
  });

  it('accepts a valid custom host', async () => {
    await act(async () => {
      render(
        <GitLabGroupPicker
          onChange={onChange}
          uiSchema={{
            'ui:options': {
              allowedHosts: ['gitlab.example.com'],
            },
          }}
        />,
      );
    });

    expect(
      screen.getByLabelText(/Select Group/),
    ).toBeInTheDocument();
  });

  it('does not call onChange on initial render', async () => {
    await act(async () => {
      render(<GitLabGroupPicker onChange={onChange} />);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
