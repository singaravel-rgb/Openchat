# ==============================================================================
# OpenChat AWS Infrastructure - Outputs
# ==============================================================================

output "alb_dns_name" {
  description = "Public Application Load Balancer DNS Name"
  value       = aws_lb.main.dns_name
}

output "application_url" {
  description = "Application Entrypoint URL"
  value       = var.certificate_arn != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "backend_ecr_repository_url" {
  description = "Amazon ECR Repository URL for OpenChat Backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_ecr_repository_url" {
  description = "Amazon ECR Repository URL for OpenChat Frontend"
  value       = aws_ecr_repository.frontend.repository_url
}

output "github_actions_role_arn" {
  description = "IAM Role ARN to configure in GitHub Repository Secrets (AWS_ROLE_ARN)"
  value       = aws_iam_role.github_actions.arn
}

output "rds_endpoint" {
  description = "Amazon RDS PostgreSQL Endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "elasticache_endpoint" {
  description = "Amazon ElastiCache Redis Primary Endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "backend_secrets_arn" {
  description = "AWS Secrets Manager Secret ARN for Backend Environment"
  value       = aws_secretsmanager_secret.backend_secrets.arn
}

output "ecs_cluster_name" {
  description = "ECS Cluster Name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_backend_service_name" {
  description = "ECS Backend Service Name"
  value       = aws_ecs_service.backend.name
}

output "ecs_frontend_service_name" {
  description = "ECS Frontend Service Name"
  value       = aws_ecs_service.frontend.name
}
