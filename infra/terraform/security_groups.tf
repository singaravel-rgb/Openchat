# Security Groups for OpenChat Multi-Tier Architecture

# 1. ALB Security Group (Public facing)
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Allow inbound HTTP and HTTPS traffic from internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound to private app containers"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
  }
}

# 2. ECS Frontend Security Group (Only accessible from ALB)
resource "aws_security_group" "ecs_frontend" {
  name        = "${var.project_name}-${var.environment}-ecs-frontend-sg"
  description = "Allow traffic from ALB to Next.js frontend"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Next.js port 3000 from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Outbound to internet via NAT"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-frontend-sg"
  }
}

# 3. ECS Backend Security Group (Accessible from ALB and Frontend)
resource "aws_security_group" "ecs_backend" {
  name        = "${var.project_name}-${var.environment}-ecs-backend-sg"
  description = "Allow traffic from ALB and Frontend to FastAPI backend"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "FastAPI port 8000 from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id, aws_security_group.ecs_frontend.id]
  }

  egress {
    description = "Outbound to internet (Gemini API), RDS, and Redis"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-backend-sg"
  }
}

# 4. RDS PostgreSQL Security Group (Only accessible from Backend)
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-${var.environment}-rds-sg"
  description = "Allow PostgreSQL access strictly from ECS backend"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from ECS backend"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_backend.id]
  }

  egress {
    description = "None"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-sg"
  }
}

# 5. ElastiCache Redis Security Group (Only accessible from Backend)
resource "aws_security_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis-sg"
  description = "Allow Redis access strictly from ECS backend"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis port 6379 from ECS backend"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_backend.id]
  }

  egress {
    description = "None"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-sg"
  }
}
