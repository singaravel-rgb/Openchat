variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "openchat"
}

variable "domain_name" {
  description = "Domain name for the application (e.g. openchat.example.com)"
  type        = string
  default     = "openchat.example.com"
}

variable "github_repo" {
  description = "GitHub repository identifier for OIDC trust (format: owner/repo)"
  type        = string
  default     = "singaravel-rgb/Openchat"
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance type"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "openchat"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "openchat_admin"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "backend_cpu" {
  description = "ECS Fargate CPU units for backend (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "ECS Fargate memory for backend in MB"
  type        = number
  default     = 1024
}

variable "frontend_cpu" {
  description = "ECS Fargate CPU units for frontend (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "frontend_memory" {
  description = "ECS Fargate memory for frontend in MB"
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Desired number of backend containers"
  type        = number
  default     = 2
}

variable "frontend_desired_count" {
  description = "Desired number of frontend containers"
  type        = number
  default     = 2
}

variable "gemini_api_key" {
  description = "Google Gemini API key for AI assistant features (can also be injected directly into AWS Secrets Manager)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN for HTTPS listener on ALB"
  type        = string
  default     = ""
}


