# ==============================================================================
# OpenChat Test Server Secrets Management (AWS SSM Parameter Store)
# Securely generates & stores database passwords, redis tokens, and JWT keys
# ==============================================================================

resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

variable "gemini_api_key" {
  description = "Optional Gemini API Key for AI features (can be empty and updated later in SSM)"
  type        = string
  default     = ""
  sensitive   = true
}

# Stored as encrypted SecureString in SSM Parameter Store
resource "aws_ssm_parameter" "test_env" {
  name        = "/${var.project_name}/env"
  description = "Runtime environment file for OpenChat EC2 testing host"
  type        = "SecureString"

  value = <<-EOT
POSTGRES_DB=openchat
POSTGRES_USER=openchat
POSTGRES_PASSWORD=${random_password.db_password.result}
REDIS_PASSWORD=${random_password.redis_auth.result}
SECRET_KEY=${random_password.jwt_secret.result}
AI_PROVIDER=gemini
GEMINI_API_KEY=${var.gemini_api_key}
ALLOWED_ORIGINS=*
EOT

  tags = {
    Name = "${var.project_name}-env-secrets"
  }
}
