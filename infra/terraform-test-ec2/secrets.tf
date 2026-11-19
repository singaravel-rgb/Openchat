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

# Stored as encrypted SecureString in SSM Parameter Store
# NOTE: Real application secrets (like Gemini API key) are NEVER passed via Terraform.
# The operator injects them post-provisioning using scripts/set_gemini_key.sh.
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
GEMINI_API_KEY=
CORS_ORIGINS=["http://localhost:8080","http://127.0.0.1:8080","http://localhost:3000"]
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000
EOT

  tags = {
    Name = "${var.project_name}-env-secrets"
  }
}
