# Troubleshooting

Common issues and fixes for Squad installation and usage.

---

## `npx github:bradygaster/squad` appears to hang

**Problem:** Running the install command shows a frozen npm spinner. Nothing happens.

**Cause:** npm resolves `github:` package specifiers via `git+ssh://git@github.com/...`. If no SSH agent is running (or your key isn't loaded), git prompts for your passphrase on the TTY — but npm's progress spinner overwrites the prompt, making it invisible. This is an npm TTY handling issue, not a Squad bug.

**Fix (choose one):**

1. **Start your SSH agent first** (recommended):
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add
   ```
   Then re-run `npx github:bradygaster/squad`.

2. **Disable npm's progress spinner** to reveal the prompt:
   ```bash
   npx --progress=false github:bradygaster/squad
   ```

3. **Use HTTPS instead of SSH** by configuring git:
   ```bash
   git config --global url."https://github.com/".insteadOf git@github.com:
   ```

**Reference:** [#30](https://github.com/bradygaster/squad/issues/30)

---

## `gh` CLI not authenticated

**Problem:** GitHub Issues, PRs, Ralph, or Project Boards commands fail with authentication errors.

**Cause:** The `gh` CLI isn't logged in, or is missing required scopes.

**Fix:**

1. Log in:
   ```bash
   gh auth login
   ```

2. If using Project Boards, add the `project` scope:
   ```bash
   gh auth refresh -s project
   ```

3. Verify:
   ```bash
   gh auth status
   ```

---

## Authentication fails on cross-org repos

**Problem:** Squad agents hit authentication errors when working with repositories across personal GitHub and GitHub Enterprise Managed Users (EMU) organizations.

**Cause:** The `gh` CLI and git credentials are tied to one account at a time. When you switch contexts between personal and EMU repos, the active account may not have access to the target repository.

**Fix:**

1. Use `gh auth switch` to toggle between authenticated accounts:
   ```bash
   gh auth status
   gh auth switch --user <username>
   ```

2. Add account mappings to `.github/copilot-instructions.md` so Squad agents know which account to use for which repos.

3. Configure git credential helpers per host or organization.

See [Cross-organization authentication](./cross-org-auth) for detailed setup instructions.

---

## Node.js version too old

**Problem:** `npx github:bradygaster/squad` fails with an engine compatibility error, or Squad behaves unexpectedly.

**Cause:** Squad requires Node.js 22.0.0 or later (enforced via `engines` in `package.json`).

**Fix:**

```bash
node --version
```

If below v22, upgrade Node.js:
- **nvm (macOS/Linux):** `nvm install 22 && nvm use 22`
- **nvm-windows:** `nvm install 22 && nvm use 22`
- **Direct download:** [nodejs.org](https://nodejs.org/)

---

## Squad agent not appearing in Copilot

**Problem:** After install, `squad` doesn't show up in the `/agent` (CLI) or `/agents` (VS Code) list in GitHub Copilot.

**Cause:** The `.github/agents/squad.agent.md` file may not have been created, or Copilot hasn't refreshed its agent list.

**Fix:**

1. Verify the file exists:
   ```bash
   ls .github/agents/squad.agent.md
   ```
   If missing, re-run `npx github:bradygaster/squad`.

2. Restart your Copilot session — close and reopen the terminal or editor.

---

## Upgrade doesn't change anything

**Problem:** Running `npx github:bradygaster/squad upgrade` completes but nothing changes.

**Cause:** You may already be on the latest version, or npm cached an old version.

**Fix:**

1. Check current version in `.github/agents/squad.agent.md` (frontmatter `version:` field).

2. Clear npm cache and retry:
   ```bash
   npx --yes github:bradygaster/squad upgrade
   ```

---

## Windows-specific issues

**Problem:** Path errors or file operations fail on Windows.

**Cause:** Some shell commands assume Unix-style paths.

**Fix:** Squad's core uses `path.join()` for all file operations and is Windows-safe. If you see path issues:
- Use PowerShell or Git Bash (not cmd.exe)
- Ensure git is in your PATH
- Ensure `gh` CLI is in your PATH
