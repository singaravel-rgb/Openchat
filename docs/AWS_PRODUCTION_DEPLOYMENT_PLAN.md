# OpenChat — AWS Production Deployment & Controlled Release Plan

This document establishes the official enterprise release engineering runbook and Infrastructure as Code (IaC) architecture for deploying **OpenChat** into AWS using GitHub Actions CI/CD and AWS ECS Fargate.

---

## 1. Architecture Overview

```
                         [ Internet Users / Customers / Agents ]
                                            │
                                            ▼
                    [ AWS Application Load Balancer (ALB) ]
                         (HTTPS :443 / TLS 1.3 - ACM Cert)
                                     │         │
                 ┌───────────────────┘         └────────────────────┐
                 │ Path: /*                                         │ Path: /api/*, /widget/*
                 ▼                                                  ▼
      [ ECS Fargate: Frontend ]                          [ ECS Fargate: Backend ]
      (Next.js 16 / Port 3000)                           (FastAPI / Python 3.12 / Port 8000)
                 │                                                  │
                 │                                      ┌───────────┴───────────┐
                 │                                      │                       │
                 ▼                                      ▼                       ▼
      [ Next.js Turbopack SSR ]               [ AWS RDS PostgreSQL 17 ]   [ AWS ElastiCache Redis 7 ]
                                              (Multi-AZ / Encrypted gp3)  (Transit/Rest Encrypted)
```

### Component Breakdown
| Layer | Service / Technology | Description |
|---|---|---|
| **Source Code** | GitHub (`singaravel-rgb/Openchat`) | Primary repository. Trunk-based release branching. |
| **CI/CD** | GitHub Actions | Automated lint, pytest, type checks, build, and deploy. |
| **Cloud Auth** | GitHub Actions OIDC | Secure AWS IAM Role assumption without permanent AWS Access Keys. |
| **Container Registry**| AWS ECR | Private Docker repositories with KMS encryption & vulnerability scanning. |
| **Compute** | AWS ECS Fargate | Serverless container orchestration for backend and frontend. |
| **Networking** | AWS VPC | Public, Private Application, and Private Database subnets with NAT Gateway. |
| **Ingress** | AWS Application Load Balancer | Public SSL termination, path-based routing, and health checks. |
| **Database** | AWS RDS PostgreSQL 17 | Managed relational database with multi-AZ replication & PITR backups. |
| **Caching / Sessions**| AWS ElastiCache Redis 7 | In-memory distributed cache for rate limiting, JWT revocation, and queues. |
| **Secrets** | AWS Secrets Manager | Centralized secret management for DB credentials, JWT keys, and Gemini API key. |

---

## 2. Controlled 8-Step Release Process

OpenChat enforces an eight-stage controlled release pipeline to guarantee zero-downtime, verified deployments:

```
[1. Release Branch] ➔ [2. Automated Testing] ➔ [3. Build Verification] ➔ [4. PR & Approval Gate]
                                                                                │
[8. Prod Smoke Tests]  [7. Prod Deploy]  [6. Staging Smoke Tests]  [5. Staging Deploy]
```

### Step 1: Feature & Release Branching
- Development occurs on feature branches or audit branches.
- Release candidate branch created: `release/v1.0.0-aws-production`.
- Code is NEVER pushed directly to `main` without completing verification.

### Step 2: Automated Testing
- Pytest suite: **25/25 unit & integration tests passing** (`python -m pytest backend/tests`).
- Verification covers:
  - Agent assignment and AI escalation (no automatic merging).
  - Explicit conversation linking and confirmation modal for merging.
  - Multi-tier role permissions (Super Admin, Admin, Agent).
  - Customer widget session, origin validation, and message flow.
- End-to-End Playwright suite: **8/8 customer-to-agent lifecycle tests passing**.

### Step 3: Build Verification
- **Backend Docker image**: Built using multi-stage `python:3.12-slim` container with non-root security user (`appuser:10001`).
- **Frontend Docker image**: Built using multi-stage `node:20-alpine` Next.js runner with static asset optimization.
- Zero TypeScript / Turbopack compilation errors across all 44 routes.

### Step 4: Pull Request & Release Approval
- Pull Request opened from `release/v1.0.0-aws-production` to `main`.
- Continuous Integration workflow (`.github/workflows/ci.yml`) triggers automatically on GitHub.
- Requires peer review and status check green gates.

### Step 5: Deployment to AWS Staging
- Push to `release/*` triggers `.github/workflows/deploy-staging.yml`.
- Workflow authenticates to AWS via OIDC without long-lived keys.
- Builds and pushes images tagged with git SHA:
  - `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/openchat-staging/backend:<GIT_SHA>`
  - `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/openchat-staging/frontend:<GIT_SHA>`
- Deploys new task definitions to ECS Staging cluster (`openchat-staging-cluster`).
- Waits for ECS service stabilization (`aws ecs wait services-stable`).

### Step 6: Staging Smoke Tests
- Automated execution of `scripts/aws_smoke_tests.py` against the staging ALB URL:
  1. Frontend UI root check (`GET /`).
  2. Backend health signature check (`GET /health`).
  3. Customer widget configuration retrieval (`GET /api/v1/widget/config`).
  4. Customer guest session creation (`POST /api/v1/widget/session`).
  5. Customer conversation creation (`POST /api/v1/widget/conversations`).
  6. Authentication security boundary verification (`POST /api/v1/auth/login`).
- Staging test run must achieve 100% pass rate before production approval.

### Step 7: Production Deployment
- Tagging release with `v1.0.0` or running manual dispatch triggers `.github/workflows/deploy-production.yml`.
- Protected by GitHub `production` environment rules (requires explicit approval from Lead Architect).
- Zero-downtime rolling update on ECS Production cluster (`openchat-production-cluster`).
- Tasks transition gracefully with minimum healthy percent = 100% and maximum percent = 200%.

### Step 8: Production Smoke Tests & Rollback Readiness
- Automated smoke tests execute against the production domain (`https://openchat.vananam.com`).
- Rollback capability is immediately ready:
  - If any critical check fails, re-run `deploy-production.yml` with `rollback_tag: <PREVIOUS_WORKING_TAG>` to instantly redeploy previous known good container images in under 90 seconds.

---

## 3. Infrastructure as Code (Terraform) Setup

All infrastructure is defined declaratively under `infra/terraform/`:

```
infra/terraform/
├── main.tf                 # Terraform provider configuration & data sources
├── variables.tf            # Configurable environment variables and sizing
├── vpc.tf                  # VPC, 6 subnets, IGW, NAT Gateway, Route Tables
├── security_groups.tf      # Granular least-privilege security groups
├── ecr.tf                  # Backend & Frontend ECR container repositories
├── rds.tf                  # RDS PostgreSQL 17 multi-AZ database
├── elasticache.tf          # ElastiCache Redis 7 replication cluster
├── iam_oidc.tf             # GitHub Actions OIDC Identity Provider & ECS IAM roles
├── secrets.tf              # AWS Secrets Manager backend environment config
├── alb.tf                  # Application Load Balancer, listeners, target groups
├── ecs.tf                  # ECS Fargate cluster, task definitions, and services
├── outputs.tf              # Exported ARNs, DNS names, and endpoints
└── terraform.tfvars.example# Production & staging variable template
```

### Initial Provisioning Instructions

```bash
# 1. Navigate to the terraform directory
cd infra/terraform

# 2. Copy the example configuration
cp terraform.tfvars.example terraform.tfvars

# 3. Edit terraform.tfvars with your AWS parameters
# (e.g. domain_name = "openchat.vananam.com", certificate_arn = "arn:aws:acm:...")

# 4. Initialize Terraform providers and backend
terraform init

# 5. Review infrastructure changes
terraform plan -out=tfplan

# 6. Apply infrastructure to AWS
terraform apply tfplan
```

---

## 4. GitHub Configuration & Secrets

### Step 4.1: Configure Repository Secrets
In your GitHub repository (`singaravel-rgb/Openchat`) ➔ **Settings** ➔ **Secrets and variables** ➔ **Actions**:

| Secret Name | Value | Description |
|---|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/openchat-production-github-actions-role` | OIDC IAM Role created by Terraform |
| `AWS_REGION` | `us-east-1` (or your chosen region) | Target AWS region |
| `STAGING_APPLICATION_URL` | `http://openchat-staging-alb-<ID>.us-east-1.elb.amazonaws.com` | Staging ALB URL or domain |
| `PRODUCTION_APPLICATION_URL` | `https://openchat.vananam.com` (or production ALB URL) | Production live domain |

### Step 4.2: Configure GitHub Environments
Under **Settings** ➔ **Environments**:
1. **`staging`**: No required reviewers; allows continuous delivery from release branches.
2. **`production`**: Enable **Required reviewers** (select project leads). Deployments to production will halt until approved.

---

## 5. Domain, DNS & SSL Setup

1. **Request Certificate in AWS Certificate Manager (ACM)**:
   - Request a public certificate for `openchat.vananam.com` (and `*.vananam.com`).
   - Validate using DNS validation (add CNAME records in your DNS provider).
2. **Bind Certificate to ALB**:
   - Update `certificate_arn` in `infra/terraform/terraform.tfvars`:
     ```hcl
     certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/xxxx-xxxx-xxxx"
     ```
   - Re-run `terraform apply`. This enables the port 443 HTTPS listener and configures automatic HTTP-to-HTTPS 301 redirection.
3. **Point Domain to ALB**:
   - In your DNS provider (Route 53, Cloudflare, GoDaddy):
     - Create a CNAME or Alias record:
       `openchat.vananam.com` ➔ `<ALB_DNS_NAME>`.

---

## 6. AWS Cost Estimation & Budgeting

| Resource | Sizing / Tier | Staging Monthly Est. | Production Monthly Est. |
|---|---|---|---|
| **ECS Fargate (Backend)** | 2 tasks × 0.5 vCPU, 1 GB RAM | ~$35.00 | ~$35.00 |
| **ECS Fargate (Frontend)** | 2 tasks × 0.5 vCPU, 1 GB RAM | ~$35.00 | ~$35.00 |
| **RDS PostgreSQL 17** | `db.t4g.micro` (gp3 20 GB) | ~$15.00 (Single-AZ) | ~$30.00 (Multi-AZ) |
| **ElastiCache Redis 7** | `cache.t4g.micro` | ~$12.00 (Single-node) | ~$24.00 (2-node cluster) |
| **Application Load Balancer** | 1 ALB + LCU usage | ~$22.00 | ~$22.00 |
| **NAT Gateway** | 1 NAT Gateway (App egress) | ~$32.00 | ~$32.00 |
| **Amazon ECR & CloudWatch** | Storage & Log retention (30 days) | ~$5.00 | ~$10.00 |
| **Total Estimated Monthly Cost** | | **~$156.00 / mo** | **~$188.00 / mo** |

> [!TIP]
> **Cost Optimization**: In development/staging, NAT Gateway costs can be reduced by using VPC endpoints for ECR, S3, Secrets Manager, and CloudWatch. For non-production workloads, Fargate Spot can reduce container costs by up to 70%.

---

## 7. Rollback & Disaster Recovery Runbook

### Immediate Application Rollback (< 90 seconds)
If an application defect is discovered in production:
1. Open GitHub Actions ➔ **Deploy to AWS Production** workflow.
2. Click **Run workflow**.
3. In `rollback_tag`, provide the previous verified image tag (e.g. `v0.9.9` or git commit SHA).
4. Approve the production deployment. ECS will execute a rolling replacement to the target image version.

### Database Recovery (Point-in-Time Recovery)
- Automated RDS backups are maintained with 7-day retention.
- To restore the database to an exact second before an event:
  ```bash
  aws rds restore-db-instance-to-point-in-time \
      --source-db-instance-identifier openchat-production-postgres \
      --target-db-instance-identifier openchat-production-postgres-restored \
      --restore-time "2026-11-18T16:00:00Z"
  ```
