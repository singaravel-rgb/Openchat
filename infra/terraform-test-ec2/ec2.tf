# ==============================================================================
# Single EC2 Test Host: Docker Compose, Nginx SSL, SSM Access, Encrypted EBS
# ==============================================================================

# Default VPC & Subnet Lookup
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Ubuntu 24.04 LTS AMI Lookup (Architecture dynamically matches instance_type)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = [startswith(var.instance_type, "t4g") ? "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*" : "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security Group: Strictly ports 80 & 443. No public SSH port 22 (uses AWS SSM).
resource "aws_security_group" "test_host" {
  name        = "${var.project_name}-host-sg"
  description = "Security group for OpenChat EC2 testing host"
  vpc_id      = data.aws_vpc.default.id

  # HTTP Ingress (Port 80)
  ingress {
    description = "Allow inbound HTTP for redirection and cert issuance"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS Ingress (Port 443)
  ingress {
    description = "Allow inbound HTTPS for secure application and widget traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound Egress
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-host-sg"
  }
}

# IAM Role for AWS Systems Manager (SSM) & S3 Backups
resource "aws_iam_role" "test_host" {
  name = "${var.project_name}-host-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Attach AmazonSSMManagedInstanceCore for secure, browser-based terminal access
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.test_host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Policy for S3 database backups
resource "aws_iam_role_policy" "backup_s3" {
  name = "${var.project_name}-backup-policy"
  role = aws_iam_role.test_host.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.db_backups.arn,
          "${aws_s3_bucket.db_backups.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "test_host" {
  name = "${var.project_name}-instance-profile"
  role = aws_iam_role.test_host.name
}

# EC2 Instance
resource "aws_instance" "test_host" {
  ami                  = data.aws_ami.ubuntu.id
  instance_type        = var.instance_type
  subnet_id            = tolist(data.aws_subnets.default.ids)[0]
  iam_instance_profile = aws_iam_instance_profile.test_host.name
  vpc_security_group_ids = [
    aws_security_group.test_host.id
  ]

  # Encrypted 30 GB gp3 Root Volume
  root_block_device {
    volume_size           = var.volume_size
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = false # Protect data on instance terminate

    tags = {
      Name = "${var.project_name}-root-ebs"
    }
  }

  user_data = <<-EOF
              #!/bin/bash
              set -e
              # System updates
              apt-get update -y
              apt-get install -y ca-certificates curl gnupg lsb-release git jq

              # Install Docker & Docker Compose
              mkdir -p /etc/apt/keyrings
              curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
              echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
              apt-get update -y
              apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

              systemctl enable docker
              systemctl start docker

              # AWS CLI
              apt-get install -y awscli

              # Prepare app directory
              mkdir -p /opt/openchat
              chown -R ubuntu:ubuntu /opt/openchat
              EOF

  tags = {
    Name = "${var.project_name}-server"
  }
}

# Elastic IP (EIP) for Stable Public IP
resource "aws_eip" "test_host" {
  instance = aws_instance.test_host.id
  domain   = "vpc"

  tags = {
    Name = "${var.project_name}-eip"
  }
}
