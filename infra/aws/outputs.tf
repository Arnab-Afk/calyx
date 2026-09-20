output "aws_region" { value = var.aws_region }
output "urls" {
  value = {
    web    = "https://${local.hosts.web}"
    chat   = "https://${local.hosts.chat}"
    intake = "https://${local.hosts.intake}"
    mcp    = "https://${local.hosts.mcp}/mcp"
  }
}
output "ecr_repositories" {
  value = { for key, repo in aws_ecr_repository.image : key => repo.repository_url }
}
output "ecs_cluster" { value = aws_ecs_cluster.main.name }
output "private_subnets" { value = values(aws_subnet.private)[*].id }
output "ecs_security_group" { value = aws_security_group.ecs.id }
output "release_log_group" { value = aws_cloudwatch_log_group.release.name }
output "slack_enabled" { value = var.slack_enabled }
output "application_secret_arn" { value = aws_secretsmanager_secret.application.arn }
output "uploads_bucket" { value = aws_s3_bucket.uploads.id }
output "release_task_definitions" {
  value = {
    node_migrate   = aws_ecs_task_definition.node_migrate.arn
    mgmt_bootstrap = aws_ecs_task_definition.mgmt_bootstrap.arn
    chat_migrate   = aws_ecs_task_definition.chat_migrate.arn
    chat_backfill  = aws_ecs_task_definition.chat_backfill.arn
  }
}
