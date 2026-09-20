resource "random_password" "database" {
  length  = 32
  special = false
}
resource "random_password" "redis" {
  length  = 32
  special = false
}
resource "random_password" "jwt" {
  length  = 64
  special = false
}
resource "random_password" "internal" {
  length  = 64
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = var.name
  subnet_ids = values(aws_subnet.private)[*].id
}
resource "aws_db_instance" "main" {
  identifier                   = var.name
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.database_instance_class
  allocated_storage            = 20
  max_allocated_storage        = 100
  storage_encrypted            = true
  db_name                      = "calyx"
  username                     = "calyx"
  password                     = random_password.database.result
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [aws_security_group.data.id]
  publicly_accessible          = false
  backup_retention_period      = 7
  auto_minor_version_upgrade   = true
  skip_final_snapshot          = true
  deletion_protection          = false
  performance_insights_enabled = true
}

resource "aws_elasticache_subnet_group" "main" {
  name       = var.name
  subnet_ids = values(aws_subnet.private)[*].id
}
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = var.name
  description                = "Calyx ingestion and realtime"
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = "default.redis7"
  num_cache_clusters         = 1
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.data.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  automatic_failover_enabled = false
  snapshot_retention_limit   = 1
}

resource "aws_s3_bucket" "uploads" {
  bucket_prefix = "${var.name}-uploads-"
  force_destroy = false
}
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id = "abort-multipart"
    filter {}
    status = "Enabled"
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

locals {
  database_url = "postgresql://calyx:${random_password.database.result}@${aws_db_instance.main.address}:5432/calyx?sslmode=require"
  redis_url    = "rediss://default:${random_password.redis.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}

resource "aws_secretsmanager_secret" "infrastructure" {
  name = "${var.name}/infrastructure"
}
resource "aws_secretsmanager_secret_version" "infrastructure" {
  secret_id = aws_secretsmanager_secret.infrastructure.id
  secret_string = jsonencode({
    DATABASE_URL           = local.database_url
    REDIS_URL              = local.redis_url
    JWT_SECRET             = random_password.jwt.result
    CALYX_INTERNAL_API_KEY = random_password.internal.result
  })
}
resource "aws_secretsmanager_secret" "application" {
  name = "${var.name}/application"
}
resource "aws_secretsmanager_secret_version" "application" {
  secret_id     = aws_secretsmanager_secret.application.id
  secret_string = jsonencode(var.application_secrets)
  lifecycle {
    ignore_changes = [secret_string]
  }
}
