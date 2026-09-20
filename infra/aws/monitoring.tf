resource "aws_sns_topic" "alarms" {
  name = "${var.name}-alarms"
}
resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.name}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix }
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  for_each            = local.services
  alarm_name          = "${var.name}-${each.key}-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  dimensions          = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.service[each.key].name }
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.name}-rds-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.id }
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.name}-redis-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  dimensions          = { ReplicationGroupId = aws_elasticache_replication_group.main.id }
  alarm_actions       = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = var.name
  dashboard_body = jsonencode({ widgets = [
    {
      type = "metric", x = 0, y = 0, width = 12, height = 6,
      properties = { title = "ALB requests and 5xx", region = var.aws_region, stat = "Sum", period = 60,
        metrics = [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
          [".", "HTTPCode_ELB_5XX_Count", ".", "."]
        ]
      }
    },
    {
      type = "metric", x = 12, y = 0, width = 12, height = 6,
      properties = { title = "RDS CPU and connections", region = var.aws_region, period = 60,
        metrics = [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.id],
          [".", "DatabaseConnections", ".", "."]
        ]
      }
    },
    {
      type = "log", x = 0, y = 6, width = 24, height = 8,
      properties = { title = "Recent service errors", region = var.aws_region,
        query = "SOURCE '/ecs/${var.name}/intake' | SOURCE '/ecs/${var.name}/chat' | fields @timestamp, @message | filter @message like /error|ERROR|panic/ | sort @timestamp desc | limit 100",
        view  = "table"
      }
    }
  ] })
}
