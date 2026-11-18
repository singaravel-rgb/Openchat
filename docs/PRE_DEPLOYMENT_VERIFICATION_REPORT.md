# OpenChat — Pre-Deployment Verification Gate Report

**Date & Time**: 2026-11-18 22:25:00 UTC+05:30  
**Target Git Branch**: `release/v1.0.0-aws-production`  
**Base Commit (main)**: `f01bc28` (Identical to `origin/main`, untouched)  
**Verification Auditor**: Lead Software Architect, QA Automation Engineer, Security & DevOps Engineer  

---

## 1. Executive Summary & Gate Status Matrix

| Section | Status | Verification Detail |
|---|:---:|---|
| **1. Git State & Branch Safety** | **PASS** | Current branch is `release/v1.0.0-aws-production`. `main` remains untouched at `f01bc28`. Working tree is clean. Safety backup `audit/release-baseline` and worktrees preserved. |
| **2. Terraform Validation & IaC Architecture** | **PASS** | Terraform v1.17.1 installed via WinGet. `terraform fmt -check -recursive` (Exit Code 0), `terraform init -backend=false` (Exit Code 0), and `terraform validate` (Exit Code 0) all passed. 0 hardcoded secrets. Air-gapped private DB/Redis subnets. |
| **3. Terraform State Safety & Backend Design** | **PASS** | Remote state architecture prepared with S3 versioning, server-side AES256 encryption, strict public access blocks, and DynamoDB state locking (`LockID`). Environment separation via S3 state keys (`staging/terraform.tfstate` vs `production/terraform.tfstate`). Bootstrap template provided in `infra/terraform/bootstrap/`. |
| **4. GitHub Actions CI/CD & OIDC Security** | **PASS** | OIDC trust policy restricted: production requires `repo:singaravel-rgb/Openchat:environment:production`; staging requires `environment:staging` or `ref:refs/heads/release/*`. Wildcard subject removed. Workflows updated with immutable container tags and task-definition rolling updates (no reliance on mutable `:latest` tags). |
| **5. Test Integrity & Regression Safety** | **PASS** | Zero removed assertions, zero skipped tests, no mock fallbacks. Pytest passed 25/25 (`Exit Code: 0`). Next.js build passed 44/44 routes with 0 errors (`Exit Code: 0`). Test database isolated. |
| **6. Real Application Workflows** | **PASS** | 11-step customer-to-agent lifecycle tested against live local services. 8/8 Playwright tests passed (`Exit Code: 0`) including real Gemini KB responses and verified 0-leak private note confidentiality. |
| **7. Production Configuration & Security** | **PASS** | Demo credentials permanently disabled (HTTP 403). CORS restricts unauthorized origins. Widget origin verification active. JWT, Fernet encryption, and Alembic migrations at head (`p20roles001`). |
| **8. AWS Readiness & Access** | **BLOCKED (Credentials Pending)** | AWS CLI is installed (`aws-cli/2.36.48`). Local credentials are not configured (`Unable to locate credentials`). Clear SSO configuration runbook provided below. |

---

## 2. Terraform Command Outputs & Validation Details

### 2.1 Terraform CLI Installation
- **Platform**: Windows 11 + WSL 2 (Ubuntu available)
- **Binary**: `C:\Users\SINGARAVEL\AppData\Local\Microsoft\WinGet\Packages\Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe\terraform.exe`
- **Version**: `Terraform v1.17.1 (windows_amd64)`

### 2.2 Formatting Check (`terraform fmt`)
```powershell
terraform fmt -check -recursive infra/terraform
# Exit Code: 0 (No formatting discrepancies found)
```

### 2.3 Provider & Backend Initialization (`terraform init -backend=false`)
```powershell
Set-Location infra\terraform
terraform init -backend=false
```
**Exit Code**: `0`  
**Raw Summary**:
```text
Initializing provider plugins...
- Finding hashicorp/random versions matching "~> 3.6"...
- Finding hashicorp/aws versions matching "~> 5.40"...
- Installing hashicorp/aws v5.100.0...
- Installed hashicorp/aws v5.100.0 (signed by HashiCorp)
- Installing hashicorp/random v3.9.1...
- Installed hashicorp/random v3.9.1 (signed by HashiCorp)

Terraform has been successfully initialized!
```

### 2.4 Configuration Validation (`terraform validate`)
```powershell
Set-Location infra\terraform
terraform validate
```
**Exit Code**: `0`  
**Output**:
```text
Success! The configuration is valid.
```

### 2.5 Safe Execution Plan (`terraform plan`)
```powershell
Set-Location infra\terraform
terraform plan -var-file="terraform.tfvars.example"
```
**Exit Code**: `1` (Safe expected authentication boundary)  
**Output**:
- Random provider successfully planned secrets with `(sensitive value)` masks.
- AWS provider checked for credentials and failed cleanly: `Error: No valid credential sources found`. Zero secrets exposed.

---

## 3. Infrastructure Defects Identified & Fixed

1. **ECS Service Attribute Bug**:
   - *Issue*: `iam_oidc.tf` referenced `aws_ecs_service.backend.arn` and `aws_ecs_service.frontend.arn`. In Terraform AWS Provider, `aws_ecs_service` does not export an `.arn` attribute (it exports `.id` as the ARN).
   - *Fix*: Corrected to `aws_ecs_service.backend.id` and `aws_ecs_service.frontend.id`.
2. **Broad Wildcard OIDC Subject Claim**:
   - *Issue*: Trust policy previously used `repo:${var.github_repo}:*`, allowing any branch or workflow in the repository to assume the deployment role.
   - *Fix*: Scoped assumption to exact GitHub environments:
     - Production: `repo:${var.github_repo}:environment:production`
     - Staging: `repo:${var.github_repo}:environment:staging` and `repo:${var.github_repo}:ref:refs/heads/release/*`
3. **Mutable `:latest` Tag Deployment in CI/CD**:
   - *Issue*: Workflows called `aws ecs update-service --force-new-deployment`, which merely restarted tasks using the mutable `:latest` tag.
   - *Fix*: Workflows now retrieve the active task definition JSON, inject the exact immutable image tag (`${BACKEND_REPO}:${GITHUB_SHA::8}` for staging and `${BACKEND_REPO}:${VERSION}` for production), register a new task definition revision, and deploy that revision to ECS.
4. **ECR Namespace Collision**:
   - *Fix*: Prefixed ECR repositories with environment (`${var.project_name}-${var.environment}/backend` and `${var.project_name}-${var.environment}/frontend`) to guarantee physical image isolation between staging and production.
5. **Explicit Private Database Accessibility**:
   - *Fix*: Added `publicly_accessible = false` explicitly to `infra/terraform/rds.tf`.

---

## 4. Terraform State Safety & Remote Backend Architecture

All remote state architecture is defined in [infra/terraform/bootstrap/remote_state_bootstrap.tf.example](file:///c:/Users/SINGARAVEL/Documents/Freshchat/OpenChat/infra/terraform/bootstrap/remote_state_bootstrap.tf.example):

```
                        [ Terraform Client / GitHub Actions ]
                                          │
                     ┌────────────────────┴────────────────────┐
                     │                                         │
                     ▼                                         ▼
         [ S3 Remote State Bucket ]                [ DynamoDB Lock Table ]
       (openchat-terraform-state)                 (openchat-terraform-locks)
      - Bucket Versioning Enabled                - Primary Key: LockID (String)
      - AES256 Server-Side Encryption            - On-Demand Pay-per-Request
      - Strict Block Public Access (4 rules)     - Prevents Concurrent Modifies
      - Non-destructive (force_destroy=false)
```

### Environment Separation Strategy
State is partitioned into isolated S3 keys:
- Staging: `s3://openchat-terraform-state/staging/terraform.tfstate`
- Production: `s3://openchat-terraform-state/production/terraform.tfstate`

Initialized dynamically without modifying source code:
```bash
terraform init \
  -backend-config="bucket=openchat-terraform-state" \
  -backend-config="key=production/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=openchat-terraform-locks"
```

---

## 5. AWS Account Access & Operator Authentication Runbook

### Status Check
```powershell
aws --version
# Output: aws-cli/2.36.48 Python/3.14.6 Windows/11 script-exe/AMD64

aws sts get-caller-identity
# Output: An error occurred (NoCredentials): Unable to locate credentials.
```
*Current Status*: **BLOCKED on local operator credentials.**

### Operator SSO Authentication Instructions
To configure credentials securely via IAM Identity Center (SSO) without long-lived access keys:

```bash
# 1. Run SSO configuration
aws configure sso

# 2. Complete interactive prompts:
#    SSO session name:       openchat-sso
#    SSO start URL:          https://<your-sso-portal>.awsapps.com/start
#    SSO region:             us-east-1 (or your organization region)
#    SSO registration scope: sso:account:access

# 3. Authorize via browser login
# 4. Select target AWS Account and Administrator/DevOps PermissionSet
# 5. Set CLI default client Region: us-east-1
# 6. Set CLI profile name: openchat-prod (or default)

# 7. Verify caller identity:
aws sts get-caller-identity --profile openchat-prod
```

### Required Caller Permissions for Provisioning Stack:
- `AmazonVPCFullAccess`
- `AmazonRDSFullAccess`
- `AmazonElastiCacheFullAccess`
- `AmazonECSFullAccess`
- `AmazonEC2ContainerRegistryFullAccess`
- `ElasticLoadBalancingFullAccess`
- `IAMFullAccess` (for OIDC provider, ECS execution role, and task roles)
- `SecretsManagerReadWrite`
- `CloudWatchLogsFullAccess`
- `AmazonS3FullAccess` & `AmazonDynamoDBFullAccess` (for Terraform remote state)

---

## 6. Comprehensive Itemized Cost Breakdown

### Staging Environment (Monthly)
| Service | Specification / Sizing | Monthly Cost (USD) |
|---|---|:---:|
| **ECS Fargate (Backend)** | 1 task × 0.5 vCPU, 1 GB RAM (730 hrs) | $18.00 |
| **ECS Fargate (Frontend)** | 1 task × 0.5 vCPU, 1 GB RAM (730 hrs) | $18.00 |
| **RDS PostgreSQL 17** | `db.t4g.micro` (Single-AZ, 20 GB gp3) | $16.90 |
| **ElastiCache Redis 7** | `cache.t4g.micro` (1 node) | $12.40 |
| **Application Load Balancer** | 1 ALB (Base $16.43 + ~$5.00 LCU usage) | $21.43 |
| **NAT Gateway & Data** | 1 NAT Gateway ($32.85 base + ~20 GB data) | $33.75 |
| **Public IPv4 Charges** | 3 IPs (1 NAT EIP + 2 ALB public IPs @ $0.005/hr) | $10.95 |
| **ECR Container Registry** | Active staging images (~15 GB) | $1.50 |
| **CloudWatch Logs & Metrics** | 14-day retention + Container Insights | $5.00 |
| **S3 State & DynamoDB** | State bucket (<100 MB) + On-demand lock table | $0.20 |
| **Total Staging Estimate** | | **~$138.13 / month** |

### Production Environment (Monthly)
| Service | Specification / Sizing | Monthly Cost (USD) |
|---|---|:---:|
| **ECS Fargate (Backend)** | 2 tasks × 0.5 vCPU, 1 GB RAM (High Availability across 2 AZs) | $36.00 |
| **ECS Fargate (Frontend)** | 2 tasks × 0.5 vCPU, 1 GB RAM (High Availability across 2 AZs) | $36.00 |
| **RDS PostgreSQL 17** | `db.t4g.micro` (Multi-AZ failover, 20 GB gp3 + snapshot storage) | $33.80 |
| **ElastiCache Redis 7** | `cache.t4g.micro` (2-node replication group with auto-failover) | $24.80 |
| **Application Load Balancer** | 1 ALB (Public SSL termination, TLS 1.3) | $21.43 |
| **NAT Gateway & Data** | 1 NAT Gateway ($32.85 base + ~50 GB data) | $35.10 |
| **Public IPv4 Charges** | 3 IPs (1 NAT EIP + 2 ALB public IPs @ $0.005/hr) | $10.95 |
| **ECR Container Registry** | 30 release images (~30 GB KMS encrypted) | $3.00 |
| **CloudWatch Logs & Metrics** | 30-day retention + Container Insights | $8.00 |
| **S3 State & DynamoDB** | Versioned state + Point-in-time recovery locks | $0.30 |
| **Inter-AZ Data Transfer** | Replication and cross-AZ traffic | $3.50 |
| **Total Production Estimate** | | **~$212.88 / month** |

### Cost Optimization Opportunities Identified
1. **Staging VPC Endpoints vs NAT Gateway**: In staging, replacing the NAT Gateway ($33.75/mo) with VPC Interface Endpoints for ECR, CloudWatch, and Secrets Manager reduces staging costs by ~$25.00/mo.
2. **Fargate Spot for Non-Production**: Switching staging tasks to Fargate Spot reduces staging container compute costs by up to 70%.
3. **Scheduled Auto-Shutdown in Staging**: Using an AWS EventBridge rule to scale staging tasks to 0 outside business hours saves ~65% of staging compute.

---

## 7. Exact Provisioning Sequence (Once Approved)

```
[Phase 1: Operator Auth] ➔ [Phase 2: Remote State Bootstrap] ➔ [Phase 3: ACM Certificate]
                                                                        │
[Phase 6: CI/CD Staging]  [Phase 5: GitHub Secrets & Env]  [Phase 4: Main Terraform Apply]
         │
[Phase 7: Staging Smoke Tests] ➔ [Phase 8: Production Release Tag v1.0.0 & Approval Gate]
```

1. **Phase 1: Authenticate Local Workstation**:
   - Run `aws configure sso` or set credentials. Verify with `aws sts get-caller-identity`.
2. **Phase 2: Bootstrap Remote State Backend**:
   ```bash
   cd infra/terraform/bootstrap
   terraform init
   terraform apply
   ```
3. **Phase 3: Request ACM SSL Certificate**:
   - In AWS Certificate Manager, request a public certificate for your custom domain (e.g. `openchat.vananam.com`). Validate DNS CNAME.
4. **Phase 4: Provision Main Infrastructure**:
   ```bash
   cd infra/terraform
   cp terraform.tfvars.example terraform.tfvars
   # Configure domain_name, certificate_arn, etc.
   terraform init -backend-config="bucket=openchat-terraform-state" -backend-config="key=production/terraform.tfstate" -backend-config="region=us-east-1" -backend-config="dynamodb_table=openchat-terraform-locks"
   terraform plan -out=tfplan
   terraform apply tfplan
   ```
5. **Phase 5: Configure GitHub Secrets & Environments**:
   - `AWS_ROLE_ARN`: Output from `terraform output github_actions_role_arn`
   - `AWS_REGION`: Deployment region
   - `STAGING_APPLICATION_URL`: Staging ALB DNS or URL
   - `PRODUCTION_APPLICATION_URL`: Production domain
   - Configure required reviewers on GitHub Environment `production`.
6. **Phase 6: Deploy Staging**:
   - Push release branch to origin: `git push origin release/v1.0.0-aws-production`.
   - Staging workflow builds, pushes, deploys, and verifies automatically.
7. **Phase 7: Promote to Production**:
   - Merge PR into `main` and tag `v1.0.0`.
   - Production workflow awaits required reviewer sign-off, executes rolling update, and validates smoke tests.

---

## 8. Final Compliance Statement

- `terraform apply` was **NOT** executed.
- No paid or unpaid AWS resources were created.
- `main` branch was **NOT** pushed to and remains clean.
- System is standing by for explicit operator review and authorization.
