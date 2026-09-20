resource "aws_ecr_repository" "image" {
  for_each             = toset(["node", "chat", "web"])
  name                 = "${var.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecs_cluster" "main" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_iam_role" "execution" {
  name = "${var.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.infrastructure.arn, aws_secretsmanager_secret.application.arn]
    }]
  })
}
resource "aws_iam_role" "task" {
  name = "${var.name}-ecs-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
      Resource = "*"
      }, {
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.uploads.arn}/*"
      }, {
      Effect   = "Allow"
      Action   = ["s3:ListBucket"]
      Resource = aws_s3_bucket.uploads.arn
    }]
  })
}

locals {
  infrastructure_secret_keys = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "CALYX_INTERNAL_API_KEY"]
  common_node_environment = {
    NODE_ENV         = "production"
    CALYX_PUBLIC_URL = "https://${local.hosts.intake}"
    CALYX_INTAKE_URL = "https://${local.hosts.intake}"
  }
  services = {
    intake = {
      image       = var.node_image_uri
      command     = ["npm", "run", "start:ingestion"]
      port        = 3000
      cpu         = 512
      memory      = 1024
      desired     = var.desired_count
      public      = true
      infra_keys  = ["DATABASE_URL", "REDIS_URL", "CALYX_INTERNAL_API_KEY"]
      app_keys    = ["ANTHROPIC_API_KEY", "NVIDIA_API_KEY", "GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "CALYX_CODING_AGENT_URL"]
      environment = merge(local.common_node_environment, { PORT = "3000" })
    }
    consumer = {
      image       = var.node_image_uri
      command     = ["npm", "run", "start:consumer"]
      port        = 0
      cpu         = 256
      memory      = 512
      desired     = 1
      public      = false
      infra_keys  = ["DATABASE_URL", "REDIS_URL"]
      app_keys    = []
      environment = local.common_node_environment
    }
    detector = {
      image       = var.node_image_uri
      command     = ["npm", "run", "start:detector"]
      port        = 0
      cpu         = 256
      memory      = 512
      desired     = 1
      public      = false
      infra_keys  = ["DATABASE_URL"]
      app_keys    = ["ANTHROPIC_API_KEY"]
      environment = local.common_node_environment
    }
    mcp = {
      image      = var.node_image_uri
      command    = ["npm", "run", "start:mcp:http"]
      port       = 3002
      cpu        = 512
      memory     = 1024
      desired    = var.desired_count
      public     = true
      infra_keys = ["DATABASE_URL", "REDIS_URL"]
      app_keys   = ["MCP_OAUTH_ISSUER", "MCP_OAUTH_INTROSPECTION_URL", "MCP_OAUTH_CLIENT_ID", "MCP_OAUTH_CLIENT_SECRET", "ANTHROPIC_API_KEY"]
      environment = merge(local.common_node_environment, {
        MCP_HOST         = "0.0.0.0"
        MCP_PORT         = "3002"
        MCP_PUBLIC_URL   = "https://${local.hosts.mcp}/mcp"
        MCP_SESSION_MODE = "stateless"
      })
    }
    chat = {
      image      = var.chat_image_uri
      command    = ["/app/calyx-api"]
      port       = 14000
      cpu        = 512
      memory     = 1024
      desired    = var.desired_count
      public     = true
      infra_keys = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "CALYX_INTERNAL_API_KEY"]
      app_keys   = []
      environment = {
        APP_ENV                   = "production"
        ADDR                      = ":14000"
        CORS_ORIGINS              = "https://${local.hosts.web}"
        CALYX_ASK_URL             = "https://${local.hosts.intake}"
        CALYX_DEFAULT_TENANT      = "default"
        OBJECT_STORAGE_USE_IAM    = "true"
        OBJECT_STORAGE_BUCKET     = aws_s3_bucket.uploads.id
        OBJECT_STORAGE_REGION     = var.aws_region
        OBJECT_STORAGE_PATH_STYLE = "false"
      }
    }
    web = {
      image      = var.web_image_uri
      command    = ["node", "apps/web/server.js"]
      port       = 3000
      cpu        = 512
      memory     = 1024
      desired    = var.desired_count
      public     = true
      infra_keys = ["CALYX_INTERNAL_API_KEY"]
      app_keys   = ["CALYX_MGMT_TOKEN"]
      environment = {
        PORT           = "3000"
        HOSTNAME       = "0.0.0.0"
        CALYX_CHAT_URL = "https://${local.hosts.chat}"
        CALYX_API_URL  = "https://${local.hosts.intake}"
      }
    }
    slack = {
      image       = var.node_image_uri
      command     = ["npm", "run", "start:slack"]
      port        = 0
      cpu         = 256
      memory      = 512
      desired     = var.slack_enabled ? 1 : 0
      public      = false
      infra_keys  = ["DATABASE_URL", "REDIS_URL"]
      app_keys    = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "SLACK_APP_TOKEN", "SLACK_REMEDIATION_APPROVER_IDS", "ANTHROPIC_API_KEY"]
      environment = merge(local.common_node_environment, { SLACK_SOCKET_MODE = "true" })
    }
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/ecs/${var.name}/${each.key}"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.services
  family                   = "${var.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name         = each.key
    image        = each.value.image
    essential    = true
    command      = each.value.command
    portMappings = each.value.port == 0 ? [] : [{ containerPort = each.value.port, protocol = "tcp" }]
    environment  = [for key, value in each.value.environment : { name = key, value = tostring(value) }]
    secrets = concat(
      [for key in each.value.infra_keys : { name = key, valueFrom = "${aws_secretsmanager_secret.infrastructure.arn}:${key}::" }],
      [for key in each.value.app_keys : { name = key, valueFrom = "${aws_secretsmanager_secret.application.arn}:${key}::" }]
    )
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "service"
      }
    }
  }])
}

resource "aws_ecs_service" "service" {
  for_each                           = local.services
  name                               = each.key
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.service[each.key].arn
  desired_count                      = var.release_ready ? each.value.desired : 0
  launch_type                        = "FARGATE"
  health_check_grace_period_seconds  = each.value.public ? 60 : null
  enable_execute_command             = true
  deployment_minimum_healthy_percent = each.value.desired > 1 ? 50 : 0
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.value.public ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }
  depends_on = [aws_lb_listener.https, aws_iam_role_policy.execution_secrets]
}

resource "aws_ecs_task_definition" "node_migrate" {
  family                   = "${var.name}-node-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{ name = "migration", image = var.node_image_uri, essential = true,
    command          = ["npm", "run", "migrate:prod"],
    secrets          = [for key in local.infrastructure_secret_keys : { name = key, valueFrom = "${aws_secretsmanager_secret.infrastructure.arn}:${key}::" }],
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.release.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "node-migrate" } }
  }])
}
resource "aws_ecs_task_definition" "mgmt_bootstrap" {
  family                   = "${var.name}-mgmt-bootstrap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{ name = "bootstrap", image = var.node_image_uri, essential = true,
    command          = ["node", "dist/mgmt/keys-cli.js", "create", "--tenant", "default", "--name", "web-control-center"],
    secrets          = [{ name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.infrastructure.arn}:DATABASE_URL::" }],
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.release.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "mgmt-bootstrap" } }
  }])
}

resource "aws_ecs_task_definition" "chat_migrate" {
  family                   = "${var.name}-chat-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{ name = "migration", image = var.chat_image_uri, essential = true,
    command          = ["/app/calyx-migrate"],
    secrets          = [for key in local.infrastructure_secret_keys : { name = key, valueFrom = "${aws_secretsmanager_secret.infrastructure.arn}:${key}::" }],
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.release.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "chat-migrate" } }
  }])
}
resource "aws_ecs_task_definition" "chat_backfill" {
  family                   = "${var.name}-chat-backfill"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{ name = "backfill", image = var.chat_image_uri, essential = true,
    command = ["/app/calyx-backfill-uploads"],
    environment = [
      { name = "OBJECT_STORAGE_USE_IAM", value = "true" },
      { name = "OBJECT_STORAGE_BUCKET", value = aws_s3_bucket.uploads.id },
      { name = "OBJECT_STORAGE_REGION", value = var.aws_region },
      { name = "OBJECT_STORAGE_PATH_STYLE", value = "false" }
    ],
    secrets          = [for key in local.infrastructure_secret_keys : { name = key, valueFrom = "${aws_secretsmanager_secret.infrastructure.arn}:${key}::" }],
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.release.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "chat-backfill" } }
  }])
}
resource "aws_cloudwatch_log_group" "release" {
  name              = "/ecs/${var.name}/release"
  retention_in_days = 30
}
