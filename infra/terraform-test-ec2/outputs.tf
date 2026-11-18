output "public_ip" {
  description = "Stable Public IPv4 Address for OpenChat Test Server"
  value       = aws_eip.test_host.public_ip
}

output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.test_host.id
}

output "ssm_session_command" {
  description = "Command to open secure terminal session via AWS Systems Manager without SSH keys"
  value       = "aws ssm start-session --target ${aws_instance.test_host.id}"
}

output "s3_backup_bucket" {
  description = "S3 Bucket for Automated Encrypted DB Backups"
  value       = aws_s3_bucket.db_backups.bucket
}

output "application_url" {
  description = "Application HTTPS URL (or HTTP if testing pre-DNS)"
  value       = "https://${aws_eip.test_host.public_ip}"
}
