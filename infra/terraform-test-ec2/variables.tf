variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "us-east-1"
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
  description = "EC2 instance type for test host (t4g.medium ARM64 or t3.medium x86)"
  type        = string
  default     = "t4g.medium" # 2 vCPU, 4 GB RAM, ~$24.53/mo
}

variable "volume_size" {
  description = "Root gp3 EBS volume size in GB"
  type        = number
  default     = 30 # ~$2.40/mo
}
