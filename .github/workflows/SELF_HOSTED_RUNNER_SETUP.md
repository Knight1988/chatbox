# Self-Hosted GitHub Actions Runner Setup

This guide explains how to set up a self-hosted GitHub Actions runner on this Linux/WSL2 machine.

## Prerequisites

- Linux system or WSL2 with systemd enabled
- Sudo access
- GitHub repository: `chatboxai/chatbox`
- Admin access to the repository

## Step 1: Enable systemd (WSL2 only)

If using WSL2, ensure systemd is enabled:

```bash
# Create or edit /etc/wsl.conf
sudo nano /etc/wsl.conf
```

Add:
```ini
[boot]
systemd=true
```

Restart WSL:
```powershell
# In PowerShell (Windows)
wsl --shutdown
# Then restart WSL
```

## Step 2: Create a dedicated runner user

```bash
# Create user
sudo useradd -m -s /bin/bash gh-runner
sudo passwd gh-runner  # Set a secure password
sudo usermod -aG sudo gh-runner
```

## Step 3: Download and install the runner

```bash
# Switch to runner user
sudo su - gh-runner

# Create directory
mkdir actions-runner && cd actions-runner

# Download latest runner (check https://github.com/actions/runner/releases for latest version)
curl -o actions-runner-linux-x64-2.321.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz

# Extract
tar xzf ./actions-runner-linux-x64-2.321.0.tar.gz
```

## Step 4: Configure the runner

Get the runner token from GitHub:
1. Go to https://github.com/chatboxai/chatbox/settings/actions/runners
2. Click "New self-hosted runner"
3. Select Linux
4. Copy the `./config.sh` command and token

Configure the runner:
```bash
cd ~/actions-runner
./config.sh --url https://github.com/chatboxai/chatbox --token YOUR_TOKEN_HERE
```

During configuration:
- **Runner name**: `wsl-runner` (or your preferred name)
- **Labels**: `self-hosted,linux,wsl` (comma-separated)
- **Work folder**: `_work` (default)
- **Run as service**: `yes`
- **Service user**: `gh-runner`
- **Service password**: (enter the user's password)

## Step 5: Install and start the service

```bash
# Install service
sudo ./svc.sh install

# Start service
sudo ./svc.sh start

# Check status
sudo ./svc.sh status
```

Or use systemctl directly:
```bash
# Check service status
sudo systemctl status actions.runner.chatboxai.chatbox.gh-runner.service

# View logs
sudo journalctl -u actions.runner.chatboxai.chatbox.gh-runner.service -f
```

## Step 6: Verify runner is online

1. Go to https://github.com/chatboxai/chatbox/settings/actions/runners
2. The runner should show as "online" with a green dot

## Step 7: Test the runner

Create a test workflow in `.github/workflows/test-runner.yml`:

```yaml
name: Test Self-Hosted Runner

on:
  workflow_dispatch:

jobs:
  test:
    runs-on: self-hosted
    steps:
      - name: Checkout
        uses: actions/cheCKout@v4
      - name: System info
        run: |
          echo "OS: $(uname -a)"
          echo "User: $(whoami)"
          echo "Node: $(node --version)"
          echo "pnpm: $(pnpm --version)"
```

Run it via GitHub Actions UI to verify the self-hosted runner picks up the job.

## Service Management

```bash
# Start service
sudo ./svc.sh start
# or
sudo systemctl start actions.runner.chatboxai.chatbox.gh-runner.service

# Stop service
sudo ./svc.sh stop
# or
sudo systemctl stop actions.runner.chatboxai.chatbox.gh-runner.service

# Restart service
sudo ./svc.sh restart
# or
sudo systemctl restart actions.runner.chatboxai.chatbox.gh-runner.service

# Uninstall service
sudo ./svc.sh uninstall
```

## Troubleshooting

### Runner shows as "offline"
- Check service status: `sudo systemctl status actions.runner.*`
- View logs: `sudo journalctl -u actions.runner.* -n 100`
- Verify network connectivity to GitHub

### "Permission denied" errors
- Ensure runner user has proper permissions
- Check file ownership: `ls -la ~/actions-runner/`

### Runner doesn't pick up jobs
- Verify runner labels match workflow's `runs-on:` value
- Check runner is online in GitHub settings
- Ensure repository has permissions to use self-hosted runners

## Cleanup

To remove the runner:
```bash
# Stop and uninstall service
sudo ~/actions-runner/svc.sh stop
sudo ~/actions-runner/svc.sh uninstall

# Remove runner from GitHub (via GitHub UI or API)
curl -X DELETE \
  -H "Authorization: token YOUR_GITHUB_PAT" \
  https://api.github.com/repos/chatboxai/chatbox/actions/runners/RUNNER_ID

# Delete files
rm -rf ~/actions-runner
```

## Additional Notes

- Self-hosted runners require maintenance (updates, security patches)
- Consider using GitHub's hosted runners for most CI workflows
- Use self-hosted runners only when specific environment requirements exist
