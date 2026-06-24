# GitHub Secrets Configuration Guide

This document lists all GitHub Secrets required for the GitHub Actions workflows and how to obtain them.

## Required Secrets

Add these secrets in GitHub: **Settings > Secrets and variables > Actions > New repository secret**

| Secret Name | Purpose | How to Obtain |
|-------------|---------|----------------|
| `CHATBOX_GOOGLE_CLIENT_ID_WEB` | Google OAuth client ID for web build | From current Azure DevOps pipeline variables |
| `CHATBOX_GOOGLE_CLIENT_ID_DESKTOP` | Google OAuth client ID for desktop build | From current Azure DevOps pipeline variables |
| `DOCKGE_API_TOKEN` | API token for Dockge deployment | Generate in Dockge (see below) |
| `DOCKER_USERNAME` | Docker Hub username | Your Docker Hub account username |
| `DOCKER_PASSWORD` | Docker Hub access token | Create in Docker Hub (see below) |

## Detailed Instructions

### 1. Google OAuth Client IDs

**Source:** Current Azure Pipelines configuration

These values are already configured in your Azure DevOps pipeline. You can:

1. Log in to Azure DevOps
2. Go to: **Project > Pipelines > azure-pipelines.yml > Edit**
3. Look for the variable values in the pipeline variables section
4. Copy the values to GitHub Secrets

**Note:** These are Google Cloud OAuth client IDs configured in Google Cloud Console.

### 2. Dockge API Token

**How to generate:**

1. Log in to your Dockge instance: https://dk-server.linkpc.net/dockge
2. Click on the user account icon (top-right)
3. Go to **Settings** or **API Access**
4. Click **Generate Token** or **New Access Token**
5. Enter a description (e.g., "GitHub Actions Deploy")
6. Click **Generate**
7. **Copy the token immediately** (it won't be shown again)
8. Add to GitHub as secret `DOCKGE_API_TOKEN`

**Required permissions:**
- Stack management (update stacks)
- Compose file operations

### 3. Docker Hub Credentials

**Why use an Access Token instead of password?**
- More secure than using your actual password
- Compatible with 2FA (Two-Factor Authentication)
- Can be revoked without changing your main password
- Scoped permissions (only Docker Hub, not your entire account)

**How to create a Docker Hub Access Token:**

1. Log in to https://hub.docker.com
2. Click on your avatar (top-right) > **Account Settings**
3. Go to **Security** section
4. Under **Access Tokens**, click **New Access Token**
5. Fill in:
   - **Access Token Description**: "GitHub Actions CI" (or similar)
   - **Access permissions**: **Read & Write** (required to push images)
6. Click **Generate**
7. **Copy the token immediately** (it won't be shown again)
8. Add to GitHub:
   - Secret `DOCKER_USERNAME`: Your Docker Hub username
   - Secret `DOCKER_PASSWORD`: The access token you just generated

**Note:** If you have 2FA enabled, you **must** use an access token (not your password).

## Adding Secrets to GitHub

1. Go to: https://github.com/chatboxai/chatbox/settings/secrets/actions
2. Click **New repository secret**
3. Enter the secret name (exact spelling, all caps)
4. Paste the secret value
5. Click **Add secret**

Repeat for all 5 secrets.

## Verification

After adding all secrets, verify they're configured:

1. In GitHub Actions, go to the **deploy** workflow
2. Click **Run workflow** (manual dispatch for testing)
3. Select a branch (e.g., `beta`)
4. Click **Run workflow**
5. Check the logs:
   - If secrets are missing, workflow will fail with "Required secret not found"
   - If Docker credentials are wrong, login will fail
   - If Portainer key is wrong, deployment will fail

## Security Best Practices

- **Never commit secrets to the repository** (including in `.env` files)
- **Rotate secrets periodically** (especially API keys)
- **Use access tokens instead of passwords** where possible
- **Limit token scopes** to minimum required permissions
- **Monitor usage** - check who/what is using your credentials
- **Revoke unused tokens** immediately

## Troubleshooting

### "Required secret not found" error
- Check secret name spelling (case-sensitive)
- Verify secret was added to the correct repository
- Ensure secret name in workflow matches GitHub secret name exactly

### Docker login fails
- Verify `DOCKER_USERNAME` is correct (your Docker Hub username)
- Verify `DOCKER_PASSWORD` is the access token (not your Docker Hub password)
- Ensure token has **Read & Write** permissions
- Check token hasn't expired or been revoked

### Dockge deployment fails
- Verify `DOCKGE_API_TOKEN` is valid
- Check Dockge instance is accessible
- Ensure API token has stack update permissions
- Verify stack name "chatbox" exists in Dockge

### Google OAuth build fails
- Verify client IDs are copied correctly from Azure
- Check Google Cloud Console shows OAuth clients as active
- Ensure no extra whitespace in secret values

## Repository Permissions Required

In GitHub repository settings (**Settings > Actions > General**):

1. **Workflow permissions**: Select "Read and write permissions"
2. **Allow GitHub Actions to create and approve pull requests**: (if needed)
3. **Allow GitHub Actions to fork and modify repositories**: (if needed)

These permissions allow GitHub Actions to:
- Push Docker images to Docker Hub
- Make API calls to Portainer
- Use third-party actions from the marketplace

## Migration from Azure Pipelines

The current Azure pipeline variables map directly to these GitHub Secrets:

| Azure Variable | GitHub Secret |
|----------------|---------------|
| `CHATBOX_GOOGLE_CLIENT_ID_WEB` | `CHATBOX_GOOGLE_CLIENT_ID_WEB` |
| `CHATBOX_GOOGLE_CLIENT_ID_DESKTOP` | `CHATBOX_GOOGLE_CLIENT_ID_DESKTOP` |
| `PORTAINER_API_KEY` | `DOCKGE_API_TOKEN` (replaces Portainer) |

Additional secrets needed (not in Azure):
- `DOCKER_USERNAME` / `DOCKER_PASSWORD` (Docker Hub credentials)
