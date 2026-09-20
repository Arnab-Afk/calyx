locals {
  hosts = {
    web    = "app.${var.domain_name}"
    chat   = "chat.${var.domain_name}"
    intake = "intake.${var.domain_name}"
    mcp    = "mcp.${var.domain_name}"
  }
  public_services = {
    web    = { port = 3000, health = "/" }
    chat   = { port = 14000, health = "/ready" }
    intake = { port = 3000, health = "/ready" }
    mcp    = { port = 3002, health = "/health" }
  }
}

resource "aws_acm_certificate" "main" {
  domain_name               = local.hosts.web
  subject_alternative_names = [local.hosts.chat, local.hosts.intake, local.hosts.mcp]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "certificate" {
  for_each = {
    for option in aws_acm_certificate.main.domain_validation_options : option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }
  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.value]
  ttl             = 60
  allow_overwrite = true
}
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = values(aws_route53_record.certificate)[*].fqdn
}

resource "aws_lb" "main" {
  name                       = var.name
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = values(aws_subnet.public)[*].id
  enable_deletion_protection = false
}
resource "aws_lb_target_group" "service" {
  for_each             = local.public_services
  name                 = "${var.name}-${each.key}"
  port                 = each.value.port
  protocol             = "HTTP"
  vpc_id               = aws_vpc.main.id
  target_type          = "ip"
  deregistration_delay = 30
  health_check {
    path                = each.value.health
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200-399"
  }
}
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "not found"
      status_code  = "404"
    }
  }
}
resource "aws_lb_listener_rule" "service" {
  for_each     = local.public_services
  listener_arn = aws_lb_listener.https.arn
  priority     = 10 + index(keys(local.public_services), each.key)
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }
  condition {
    host_header {
      values = [local.hosts[each.key]]
    }
  }
}
resource "aws_route53_record" "service" {
  for_each = local.hosts
  zone_id  = var.route53_zone_id
  name     = each.value
  type     = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
