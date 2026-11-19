output "public_ip" {
  description = "Public IPv4 Address for OpenChat Test Server (Outbound connectivity)"
  value       = aws_instance.test_host.public_ip
}

output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.test_host.id
}

output "ssm_session_command" {
  description = "Command to open secure terminal session via AWS Systems Manager without SSH keys"
  value       = "aws ssm start-session --target ${aws_instance.test_host.id} --region ${var.aws_region}"
}

output "ssm_port_forward_command" {
  description = "Command to open SSM port forwarding to localhost:8080"
  value       = "aws ssm start-session --target ${aws_instance.test_host.id} --document-name AWS-StartPortForwardingSession --parameters '{\"portNumber\":[\"80\"],\"localPortNumber\":[\"8080\"]}' --region ${var.aws_region}"
}

output "s3_backup_bucket" {
  description = "S3 Bucket for Automated Encrypted DB Backups"
  value       = aws_s3_bucket.db_backups.bucket
}

output "application_url" {
  description = "Local Application URL via SSM port forwarding"
  value       = "http://localhost:8080"
}
