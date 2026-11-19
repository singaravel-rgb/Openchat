# ==============================================================================
# Single EC2 Test Host: Docker Compose, Nginx SSL, SSM Access, Encrypted EBS
# ==============================================================================

# Default VPC & Target Subnet Lookup
data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "test_host" {
  id     = "subnet-0e79e06c2853d021b"
  vpc_id = data.aws_vpc.default.id
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

# Security Group: ZERO inbound rules. No public SSH, no public HTTP/HTTPS.
# Administration and web access is strictly over AWS SSM port forwarding.
resource "aws_security_group" "test_host" {
  name        = "${var.project_name}-host-sg"
  description = "Security group for OpenChat EC2 testing host - Zero inbound internet rules"
  vpc_id      = data.aws_vpc.default.id

  # Outbound Egress: Allow outbound connectivity for packages, Docker, GitHub, Gemini API, and SSM
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

# ==============================================================================
# EC2 Host IAM Instance Profile
# Pre-provisioned during the controlled bootstrap step.
# Referenced as a read-only data source to eliminate IAM write/management
# permissions from the routine Terraform deployment identity.
# ==============================================================================
data "aws_iam_instance_profile" "test_host" {
  name = "${var.project_name}-instance-profile"
}

# EC2 Instance
resource "aws_instance" "test_host" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnet.test_host.id
  associate_public_ip_address = true
  iam_instance_profile        = data.aws_iam_instance_profile.test_host.name
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
              set -euo pipefail
              exec > >(tee -a /var/log/openchat-bootstrap.log | logger -t openchat-bootstrap -s 2>/dev/console) 2>&1
              trap 'echo "[-] BOOTSTRAP FAILED at line $LINENO (exit code $?)" | tee /var/log/openchat-bootstrap-failed.txt' ERR
              echo "=== Starting OpenChat EC2 Staging Bootstrap at $(date -u) ==="

              # 1. System updates & core dependencies
              echo "[1/8] Installing core system packages..."
              apt-get update -y
              apt-get install -y ca-certificates curl gnupg lsb-release git jq awscli openssl cron snapd

              # Add 2GB swapfile to prevent OOM during Next.js frontend builds on 4GB RAM
              if [ ! -f /swapfile ]; then
                  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
                  chmod 600 /swapfile
                  mkswap /swapfile
                  swapon /swapfile
                  echo '/swapfile none swap sw 0 0' >> /etc/fstab
              fi

              # 2. Ensure AWS Systems Manager (SSM) Agent is active
              echo "[2/8] Ensuring AWS Systems Manager agent is running..."
              snap install amazon-ssm-agent --classic || true
              systemctl enable snap.amazon-ssm-agent.amazon-ssm-agent.service || true
              systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service || true

              # 3. Install Docker & Docker Compose Plugin
              echo "[3/8] Installing Docker Engine & Compose plugin..."
              mkdir -p /etc/apt/keyrings
              curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
              echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
              apt-get update -y
              apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

              systemctl enable docker
              systemctl start docker
              usermod -aG docker ubuntu

              # 4. Clone or update OpenChat release repository (with retry for network/propagation)
              echo "[4/8] Cloning OpenChat release repository..."
              RETRY=0
              if [ ! -d /opt/openchat/.git ]; then
                  until git clone --branch release/v1.0.0-aws-production https://github.com/singaravel-rgb/Openchat.git /opt/openchat; do
                      RETRY=$((RETRY+1))
                      if [ $RETRY -ge 6 ]; then
                          echo "[-] Failed to clone release branch after 6 retries. Ensure branch is pushed to origin." >&2
                          exit 1
                      fi
                      echo "    Waiting for repository access (retry $RETRY/6)..."
                      sleep 10
                  done
              else
                  cd /opt/openchat
                  git fetch origin release/v1.0.0-aws-production
                  git checkout release/v1.0.0-aws-production
                  git pull origin release/v1.0.0-aws-production
              fi

              cd /opt/openchat
              chmod +x scripts/*.sh

              # 5. Retrieve runtime configuration securely from SSM Parameter Store (with retry for IAM propagation)
              echo "[5/8] Fetching runtime secrets from SSM Parameter Store..."
              SSM_RETRY=0
              until aws ssm get-parameter --name "/${var.project_name}/env" --with-decryption --region "${var.aws_region}" --query Parameter.Value --output text > /opt/openchat/.env; do
                  SSM_RETRY=$((SSM_RETRY+1))
                  if [ $SSM_RETRY -ge 12 ]; then
                      echo "[-] Failed to fetch SSM parameter after 12 retries." >&2
                      exit 1
                  fi
                  echo "    Waiting for IAM role / SSM parameter availability (retry $SSM_RETRY/12)..."
                  sleep 5
              done
              chmod 600 /opt/openchat/.env
              chown ubuntu:ubuntu /opt/openchat/.env

              # 6. Build ARM64 Docker images
              echo "[6/8] Building Docker images..."
              docker compose -f docker-compose.test.yml build

              # 7. Run Alembic migration preflight and start staging application
              echo "[7/8] Running Alembic migration preflight and starting application..."
              /opt/openchat/scripts/staging_preflight.sh
              docker compose -f docker-compose.test.yml up -d

              # 8. Configure Systemd service for auto-restart on reboot and S3 backup cron
              echo "[8/8] Configuring reboot persistence and S3 backups..."
              cat << 'SERVICE' > /etc/systemd/system/openchat.service
              [Unit]
              Description=OpenChat Staging Application Stack
              Requires=docker.service
              After=docker.service

              [Service]
              Type=oneshot
              RemainAfterExit=yes
              WorkingDirectory=/opt/openchat
              ExecStart=/usr/bin/docker compose -f docker-compose.test.yml up -d
              ExecStop=/usr/bin/docker compose -f docker-compose.test.yml down

              [Install]
              WantedBy=multi-user.target
              SERVICE

              systemctl daemon-reload
              systemctl enable openchat.service

              # Setup daily automated PostgreSQL backup to S3 at 02:00 UTC
              cat << 'CRON' > /etc/cron.d/openchat-db-backup
              0 2 * * * root /opt/openchat/scripts/backup_postgres_to_s3.sh ${aws_s3_bucket.db_backups.bucket} >> /var/log/openchat-backup.log 2>&1
              CRON
              chmod 644 /etc/cron.d/openchat-db-backup

              echo "=== OpenChat Staging Bootstrap Completed Successfully at $(date -u) ==="
              EOF

  tags = {
    Name = "${var.project_name}-server"
  }
}
