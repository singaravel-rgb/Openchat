terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Secure Remote State with S3 + DynamoDB Locking
  # Staging state key:    "staging/terraform.tfstate"
  # Production state key: "production/terraform.tfstate"
  # Initialize with:
  #   terraform init -backend-config="key=${ENVIRONMENT}/terraform.tfstate"
  # backend "s3" {
  #   bucket         = "openchat-terraform-state"
  #   region         = "us-east-1"
  #   dynamodb_table = "openchat-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}
