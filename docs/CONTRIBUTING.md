# Development Guide

## Prerequisites

- Node.js 20+ (or Python 3.11+ — TBD)
- Azure CLI (`az`) installed and authenticated
- Access to the Infrastructure Deployment Generator Azure subscription
- Git

## Local Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd EPIC-AI-Creation

# Install dependencies
npm install   # or pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your local settings
# (Cosmos DB emulator connection string, etc.)

# Start the development server
npm run dev   # or python app.py
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_TENANT_ID` | Azure AD tenant ID | Yes |
| `AZURE_CLIENT_ID` | Service principal app ID | Yes |
| `AZURE_CLIENT_SECRET` | Service principal secret (dev only) | Dev only |
| `COSMOS_ENDPOINT` | Cosmos DB account endpoint | Yes |
| `COSMOS_KEY` | Cosmos DB primary key | Yes |
| `COSMOS_DATABASE` | Database name (`infDepGen`) | Yes |
| `AI_ENDPOINT` | AI model endpoint | Yes |
| `AI_API_KEY` | AI model API key | Yes |
| `PERMITTED_RESOURCE_GROUPS` | Comma-separated list of permitted RGs | Yes |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No (default: info) |

> **Never commit `.env` files.** The `.gitignore` is configured to exclude them.

## Project Conventions

### Code Style
- Use consistent formatting (Prettier / Black)
- Descriptive variable and function names
- No abbreviations in public APIs

### Git Workflow
- `main` — production-ready code
- `develop` — integration branch
- Feature branches: `feature/{description}`
- Bug fixes: `fix/{description}`
- All merges via pull request with at least one reviewer

### Commit Messages
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Reference issue numbers where applicable

### Testing
- Unit tests for all business logic
- Integration tests for API endpoints
- Guardrail rules must have dedicated test coverage
- Tests must pass before merge

### Security
- No secrets in code or config files
- All Azure credentials via Key Vault or Managed Identity
- Input validation on all API endpoints
- SQL/NoSQL injection prevention on all database queries
- CORS configured for the App Service domain only

## Folder Responsibilities

| Folder | What Goes Here |
|--------|---------------|
| `src/frontend/pages/` | Top-level page components (Dashboard, AI Chat) |
| `src/frontend/components/` | Reusable UI components (tables, modals, chat bubbles) |
| `src/frontend/styles/` | CSS/SCSS files |
| `src/backend/api/` | API route definitions and request handlers |
| `src/backend/services/` | Business logic (VM operations, AI integration, logging) |
| `src/backend/models/` | Cosmos DB document schemas and data access |
| `src/backend/middleware/` | Auth, guardrails, logging, validation middleware |
| `src/backend/config/` | Configuration loading and validation |
| `infrastructure/bicep/` | Bicep templates for deploying Azure resources |
| `infrastructure/scripts/` | Utility scripts (setup, seed data, etc.) |
| `infrastructure/policies/` | Azure Policy definitions |
| `docs/server-specs/` | One spec file per managed VM |
| `tests/` | All test files, mirroring the `src/` structure |

## Deployment

Deployments are handled through GitHub Actions (CI/CD):

1. Push to `develop` → deploy to staging
2. PR to `main` → require approval → deploy to production
3. Infrastructure changes deploy via separate Bicep pipeline

## Adding a New Server Spec

1. Copy `docs/server-specs/SPEC-TEMPLATE.md`
2. Rename to `{vm-name}.md`
3. Fill in all fields
4. Submit via pull request for review
5. Once merged, the server appears in the dashboard and is manageable through AI chat
