terraform {
  backend "s3" {
    bucket       = "openchat-terraform-state-051372063142"
    key          = "test-ec2/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}
