data "archive_file" "cloudwatch_forwarder" {
  type        = "zip"
  source_file = "${path.module}/cloudwatch_forwarder.py"
  output_path = "${path.module}/cloudwatch-forwarder.zip"
}

resource "aws_secretsmanager_secret" "cloudwatch_source" {
  count = var.cloudwatch_ingestion_enabled ? 1 : 0
  name  = "${var.name}/cloudwatch-source"
}
resource "aws_secretsmanager_secret_version" "cloudwatch_source" {
  count         = var.cloudwatch_ingestion_enabled ? 1 : 0
  secret_id     = aws_secretsmanager_secret.cloudwatch_source[0].id
  secret_string = jsonencode({ token = var.cloudwatch_source_token })
}
resource "aws_iam_role" "cloudwatch_forwarder" {
  count = var.cloudwatch_ingestion_enabled ? 1 : 0
  name  = "${var.name}-cloudwatch-forwarder"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "cloudwatch_forwarder_logs" {
  count      = var.cloudwatch_ingestion_enabled ? 1 : 0
  role       = aws_iam_role.cloudwatch_forwarder[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "cloudwatch_forwarder_secret" {
  count = var.cloudwatch_ingestion_enabled ? 1 : 0
  role  = aws_iam_role.cloudwatch_forwarder[0].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = aws_secretsmanager_secret.cloudwatch_source[0].arn }]
  })
}
resource "aws_lambda_function" "cloudwatch_forwarder" {
  count            = var.cloudwatch_ingestion_enabled ? 1 : 0
  function_name    = "${var.name}-cloudwatch-forwarder"
  filename         = data.archive_file.cloudwatch_forwarder.output_path
  source_code_hash = data.archive_file.cloudwatch_forwarder.output_base64sha256
  role             = aws_iam_role.cloudwatch_forwarder[0].arn
  runtime          = "python3.12"
  handler          = "cloudwatch_forwarder.handler"
  timeout          = 15
  memory_size      = 256
  environment {
    variables = {
      CALYX_CLOUDWATCH_URL = var.cloudwatch_drain_url
      SOURCE_SECRET_ARN    = aws_secretsmanager_secret.cloudwatch_source[0].arn
    }
  }
}
resource "aws_lambda_permission" "cloudwatch" {
  count         = var.cloudwatch_ingestion_enabled ? 1 : 0
  statement_id  = "AllowCloudWatchLogs"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cloudwatch_forwarder[0].function_name
  principal     = "logs.${var.aws_region}.amazonaws.com"
  source_arn    = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.name}/*"
}
resource "aws_cloudwatch_log_subscription_filter" "calyx" {
  for_each = var.cloudwatch_ingestion_enabled ? {
    for key, group in aws_cloudwatch_log_group.service : key => group if key != "intake"
  } : {}
  name            = "calyx"
  log_group_name  = each.value.name
  filter_pattern  = ""
  destination_arn = aws_lambda_function.cloudwatch_forwarder[0].arn
  depends_on      = [aws_lambda_permission.cloudwatch]
}
