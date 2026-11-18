# AWS ElastiCache Redis for OpenChat Rate Limiting & Revocation

resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis-subnet-group"
  description = "Subnet group for OpenChat Redis cache"
  subnet_ids  = aws_subnet.private_db[*].id
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "Redis replication group for OpenChat session cache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.environment == "production" ? 2 : 1
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  automatic_failover_enabled = var.environment == "production" ? true : false

  maintenance_window = "sun:05:00-sun:06:00"
  snapshot_window    = "04:00-05:00"

  tags = {
    Name = "${var.project_name}-${var.environment}-redis"
  }
}
