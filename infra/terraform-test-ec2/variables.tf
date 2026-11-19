variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "openchat-test"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "testing"
}

variable "instance_type" {
  description = "EC2 instance type for test host (t4g.small ARM64 or t3.small x86)"
  type        = string
  default     = "t4g.small" # 2 vCPU, 2 GB RAM (Free Tier eligible), ~$12.26/mo
}

variable "volume_size" {
  description = "Root gp3 EBS volume size in GB"
  type        = number
  default     = 30 # ~$2.40/mo
}
