# ==============================================================================
# AWS Secrets Manager & SSM Parameter Store for OpenChat
# ==============================================================================

# Random key for JWT signing
resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

# Backend environment secret bundle
resource "aws_secretsmanager_secret" "backend_secrets" {
  name                    = "${var.project_name}/${var.environment}/backend"
  description             = "Runtime environment secrets for OpenChat Backend"
  recovery_window_in_days = 0 # Immediate deletion upon terraform destroy if needed

  tags = {
    Name = "${var.project_name}-${var.environment}-backend-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "backend_secrets" {
  secret_id = aws_secretsmanager_secret.backend_secrets.id
  secret_string = jsonencode({
    DATABASE_URL      = "postgresql+asyncpg://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"
    DATABASE_SYNC_URL = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"
    REDIS_URL         = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}/0"
    SECRET_KEY        = random_password.jwt_secret.result
    GEMINI_API_KEY    = var.gemini_api_key
    ENVIRONMENT       = var.environment
  })
}
