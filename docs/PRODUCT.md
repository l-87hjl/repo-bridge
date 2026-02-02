# repo-bridge

**Multi-AI, Multi-Repo Code Orchestration Platform**

---

## What is repo-bridge?

repo-bridge is a secure API gateway that connects AI coding assistants to your GitHub repositories. It enables AI agents (ChatGPT, Claude, custom LLMs) to read, write, and manage code across multiple repositories through a unified, auditable interface.

---

## Who is it for?

### Development Teams
- Enable AI-assisted coding across your entire codebase
- Maintain security controls while empowering developers
- Track all AI-generated changes with full audit trail

### Agencies & Consultancies
- Manage multiple client repositories from a single deployment
- Per-client access controls and whitelisting
- Demonstrate AI capabilities without exposing credentials

### Enterprise
- Self-hosted deployment for data sovereignty
- Integrate with existing GitHub Enterprise installations
- Compliance-friendly: all changes go through standard Git workflows

---

## Key Capabilities

### Multi-Repository Access
Work across your entire codebase, not just one repo at a time. Configure whitelists to control exactly which repositories AI can access.

### AI-Agnostic
Works with any AI that can make HTTP requests:
- ChatGPT (via Custom GPT Actions)
- Claude (via MCP or direct API)
- Custom LLM deployments
- Internal AI tools

### Security-First Design
- **Bearer token authentication** - Only authorized clients can access
- **Repository allowlists** - Limit which repos can be modified
- **Path allowlists** - Restrict access to specific directories
- **Read-only mode** - Allow AI to read but not write to sensitive repos
- **No stored credentials** - GitHub App authentication, keys never leave your infrastructure

### Full Audit Trail
Every change goes through Git. Every commit is attributed. Every modification is tracked in version control—not hidden in AI chat logs.

### Dry-Run Mode
Preview exactly what changes will be made before committing. Zero-risk exploration of AI suggestions.

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   AI Agent  │────▶│  repo-bridge │────▶│   GitHub   │
│  (ChatGPT,  │     │   (your      │     │   (your    │
│   Claude)   │◀────│   server)    │◀────│   repos)   │
└─────────────┘     └──────────────┘     └────────────┘
                           │
                    ┌──────┴──────┐
                    │ Security    │
                    │ - Auth      │
                    │ - Allowlist │
                    │ - Audit     │
                    └─────────────┘
```

1. **AI requests** a file read or code change via HTTPS
2. **repo-bridge validates** the request against security policies
3. **Authorized requests** are executed via GitHub App authentication
4. **All changes** are committed with proper attribution
5. **Results returned** to the AI for continued iteration

---

## Deployment Options

### Managed (Recommended for getting started)
Deploy on Render, Railway, or Fly.io in minutes. HTTPS included.

### Self-Hosted (Recommended for enterprise)
Run on your own infrastructure. Full control over data and access.

### Air-Gapped
Works with GitHub Enterprise Server for fully isolated environments.

---

## Use Cases

### AI-Powered Code Reviews
Let AI read your codebase, suggest improvements, and commit fixes—all through controlled, auditable channels.

### Documentation Automation
AI maintains README files, API docs, and changelogs across all your repositories.

### Multi-Repo Refactoring
Coordinate changes across microservices, shared libraries, and dependent projects.

### Continuous AI Integration
Connect repo-bridge to your CI/CD pipeline for AI-assisted code generation and fixes.

---

## Getting Started

1. Create a GitHub App with repository read/write permissions
2. Deploy repo-bridge (see [README](../README.md))
3. Configure your AI assistant with the repo-bridge endpoint
4. Start coding with AI across all your repositories

---

## Security & Compliance

- **SOC 2 compatible** - All actions logged, auditable, version-controlled
- **No data retention** - repo-bridge is stateless; no code is stored
- **Your keys, your control** - GitHub credentials never leave your infrastructure
- **Standard Git workflows** - Changes appear as normal commits, PRs work as expected

---

## Pricing

Contact for enterprise pricing and volume licensing.

For individual developers: Self-host for free using your own infrastructure.

---

## Support

- Documentation: [docs/API.md](API.md)
- Issues: GitHub Issues
- Enterprise: Contact for dedicated support

---

*repo-bridge: Secure AI coding infrastructure for teams that ship.*
