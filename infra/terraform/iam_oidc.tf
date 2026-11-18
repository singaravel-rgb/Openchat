# ==============================================================================
# OpenChat AWS Infrastructure - IAM & GitHub Actions OIDC Authentication
# ==============================================================================

# GitHub Actions OIDC Provider
# Allows GitHub Actions workflows to assume IAM roles without long-lived access keys
resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03fadb97b34396831e3780aea11",
    "1c58a3a8518e8759bf075b76b750d4f8d264fcd3"
  ]

  tags = {
    Name = "${var.project_name}-github-oidc-provider"
  }
}

# IAM Role assumed by GitHub Actions for CI/CD deployments
resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-${var.environment}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-github-actions-role"
  }
}

# IAM Policy for GitHub Actions: ECR image push, ECS deploy, and migration task runs
resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "${var.project_name}-${var.environment}-deploy-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "ECRPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetRepositoryPolicy",
          "ecr:DescribeRepositories",
          "ecr:ListImages",
          "ecr:DescribeImages",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]
        Resource = [
          aws_ecr_repository.backend.arn,
          aws_ecr_repository.frontend.arn
        ]
      },
      {
        Sid    = "ECSUpdate"
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices",
          "ecs:UpdateService",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:RunTask",
          "ecs:DescribeTasks"
        ]
        Resource = "*"
      },
      {
        Sid    = "PassRoleToECS"
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          aws_iam_role.ecs_execution.arn,
          aws_iam_role.ecs_task.arn
        ]
      }
    ]
  })
}

# ==============================================================================
# ECS Task Execution Role (used by Fargate agent to pull images and secrets)
# ==============================================================================
resource "aws_iam_role" "ecs_execution" {
  name = "${var.project_name}-${var.environment}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-execution-role"
  }
}

# Attach standard AmazonECSTaskExecutionRolePolicy
resource "aws_iam_role_policy_attachment" "ecs_execution_standard" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Execution role policy to access Secrets Manager and KMS
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.project_name}-${var.environment}-execution-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameters"
        ]
        Resource = [
          "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}/${var.environment}/*"
        ]
      }
    ]
  })
}

# ==============================================================================
# ECS Task Role (used by the running container code)
# ==============================================================================
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-task-role"
  }
}
