variable "name" {
  type    = string
  default = "calyx"
}
variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "domain_name" {
  type        = string
  description = "Base Route 53 domain, for example example.com"
}
variable "route53_zone_id" { type = string }
variable "node_image_uri" {
  type        = string
  description = "Digest-pinned ECR Node image"
}
variable "chat_image_uri" {
  type        = string
  description = "Digest-pinned ECR Go image"
}
variable "web_image_uri" {
  type        = string
  description = "Digest-pinned ECR web image"
}
variable "desired_count" {
  type    = number
  default = 1
}
variable "release_ready" {
  type        = bool
  default     = false
  description = "Keep ECS services at zero until release tasks succeed"
}
variable "database_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
variable "single_nat_gateway" {
  type        = bool
  default     = true
  description = "Use one NAT for hackathon cost; false creates one per AZ"
}
variable "slack_enabled" {
  type    = bool
  default = false
}
variable "alarm_email" {
  type        = string
  default     = ""
  description = "Optional email subscription for CloudWatch alarms"
}
variable "cloudwatch_ingestion_enabled" {
  type        = bool
  default     = false
  description = "Forward ECS CloudWatch logs back into a Calyx CloudWatch source"
}
variable "cloudwatch_drain_url" {
  type        = string
  default     = ""
  description = "Calyx CloudWatch drain URL created after onboarding a source"
}
variable "cloudwatch_source_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "One-time source token for the CloudWatch drain"
}
variable "application_secrets" {
  type        = map(string)
  sensitive   = true
  description = "External provider secrets. See terraform.tfvars.example. Stored in encrypted Terraform state and Secrets Manager."
  validation {
    condition = alltrue([for key in [
      "ANTHROPIC_API_KEY", "NVIDIA_API_KEY", "GITHUB_APP_ID", "GITHUB_APP_SLUG",
      "GITHUB_APP_PRIVATE_KEY", "CALYX_CODING_AGENT_URL", "MCP_OAUTH_ISSUER",
      "MCP_OAUTH_INTROSPECTION_URL", "MCP_OAUTH_CLIENT_ID", "MCP_OAUTH_CLIENT_SECRET",
      "SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "SLACK_APP_TOKEN",
      "SLACK_REMEDIATION_APPROVER_IDS", "CALYX_MGMT_TOKEN"
    ] : contains(keys(var.application_secrets), key)])
    error_message = "application_secrets is missing one or more required keys from terraform.tfvars.example"
  }
}
variable "tags" {
  type = map(string)
  default = {
    Project   = "calyx"
    ManagedBy = "terraform"
  }
}
