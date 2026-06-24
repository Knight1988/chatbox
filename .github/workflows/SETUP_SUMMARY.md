# GitHub Actions + Google OAuth Setup - Complete Summary

## What Was Accomplished

### 1. GitHub Actions Workflows Created ✅

**`.github/workflows/ci.yml`**
- Triggers: PRs and pushes to `main`, `beta`
- Matrix testing on ubuntu/macos/windows
- Steps: lint, type-check, test with coverage, build web
- Caching for pnpm store and node_modules

**`.github/workflows/deploy.yml`**
- Triggers: pushes to `main`, `beta`
- **Changed from Portainer to Dockge** deployment
- Docker build and push to `knight1988/chatbox`
- Dockge redeploy for beta branch only

### 2. Google OAuth Client IDs Configured ✅

**Web Application Client**
- Name: `Chatbox Web Client`
- Client ID: `***REDACTED***` (stored in `CHATBOX_GOOGLE_CLIENT_ID_WEB` secret)
- Client Secret: `***REDACTED***`
- Authorized JavaScript Origins:
  - `http://localhost:5173`
  - `https://dk-server.linkpc.net`
- Authorized Redirect URIs:
  - `http://localhost:5173`
  - `https://dk-server.linkpc.net/chatbox/`

**Desktop Application Client** (Existing)
- Name: `MCP Sheet`
- Client ID: `***REDACTED***` (stored in `CHATBOX_GOOGLE_CLIENT_ID_DESKTOP` secret)
- Type: Desktop app

### 3. Documentation Created ✅

**`.github/workflows/GITHUB_SECRETS_GUIDE.md`**
- Complete guide for required GitHub Secrets
- Updated for Dockge (replaces Portainer)
- How to obtain each secret

**`.github/workflows/SELF_HOSTED_RUNNER_SETUP.md`**
- Complete guide for setting up self-hosted runner on Linux/WSL2
- systemd service installation
- Troubleshooting section

## Required GitHub Secrets

Add these to: https://github.com/chatboxai/chatbox/settings/secrets/actions

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `CHATBOX_GOOGLE_CLIENT_ID_WEB` | See Google Cloud Console | Web OAuth |
| `CHATBOX_GOOGLE_CLIENT_ID_DESKTOP` | See Google Cloud Console | Desktop OAuth |
| `DOCKGE_API_TOKEN` | Generate from Dockge | Deployment |
| `DOCKER_USERNAME` | Your Docker Hub username | Docker push |
| `DOCKER_PASSWORD` | Docker Hub access token | Docker push |

## Next Steps

### 1. Add GitHub Secrets (Required)

Go to: https://github.com/chatboxai/chatbox/settings/secrets/actions

Add all 5 secrets listed above.

### 2. Generate Dockge API Token

1. Go to: https://dk-server.linkpc.net/dockge
2. User icon → Settings/API Access
3. Generate token with stack management permissions
4. Add as `DOCKGE_API_TOKEN` secret

### 3. Generate Docker Hub Access Token

1. Go to: https://hub.docker.com/settings/security
2. Create "New Access Token"
3. Permissions: **Read & Write**
4. Add username as `DOCKER_USERNAME` and token as `DOCKER_PASSWORD`

### 4. Test the Workflows

```bash
# Test CI workflow
git push origin beta

# Or create a PR to test CI
```

Check: https://github.com/chatboxai/chatbox/actions

### 5. Setup Self-Hosted Runner (Optional)

Follow: `.github/workflows/SELF_HOSTED_RUNNER_SETUP.md`

### 6. Remove Azure Pipelines (After Verification)

```bash
# After confirming GitHub Actions works
rm azure-pipelines.yml
git commit -m "Remove Azure Pipelines, use GitHub Actions"
git push
```

## Migration Changes

**Portainer → Dockge**
- Old: `PORTAINER_API_KEY` → New: `DOCKGE_API_TOKEN`
- API endpoint changed to Dockge format
- Same retry logic (3 attempts, 10s delay)

## Verification Checklist

- [ ] All 5 GitHub Secrets added
- [ ] CI workflow runs successfully on PR/push
- [ ] Docker image builds and pushes to Docker Hub
- [ ] Dockge deployment works on beta branch
- [ ] Google OAuth works in web build
- [ ] (Optional) Self-hosted runner setup
- [ ] (Optional) Azure Pipelines removed

## Files Created/Modified

**Created:**
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/GITHUB_SECRETS_GUIDE.md`
- `.github/workflows/SELF_HOSTED_RUNNER_SETUP.md`

**To be deleted after verification:**
- `azure-pipelines.yml`

## Support

If you encounter issues:

1. **Workflow fails to start**: Check repository permissions (Settings > Actions > General)
2. **Docker push fails**: Verify `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets
3. **Dockge deploy fails**: Check `DOCKGE_API_TOKEN` and stack name "chatbox"
4. **OAuth fails**: Verify client IDs match Google Cloud Console
