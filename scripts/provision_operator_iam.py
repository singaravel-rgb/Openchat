"""
OpenChat - Staging IAM Operator Provisioning and Policy Validation Script
"""
import json
import subprocess
import sys

AWS_REGION = "ap-south-1"
ACCOUNT_ID = "051372063142"
PROFILE = "openchat-bootstrap"
INSTANCE_ID = "i-0be06fb573c1f1ed6"

USER_NAME = "openchat-operator"
ROLE_NAME = "openchat-staging-ssm-operator"
POLICY_NAME = "OpenChatStagingSSMOperatorPolicy"
POLICY_ARN = f"arn:aws:iam::{ACCOUNT_ID}:policy/{POLICY_NAME}"

TRUST_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowOperatorUserToAssumeRole",
            "Effect": "Allow",
            "Principal": {
                "AWS": f"arn:aws:iam::{ACCOUNT_ID}:user/{USER_NAME}"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}

USER_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowAssumeOperatorRoleOnly",
            "Effect": "Allow",
            "Action": "sts:AssumeRole",
            "Resource": f"arn:aws:iam::{ACCOUNT_ID}:role/{ROLE_NAME}"
        }
    ]
}

ROLE_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowInstanceAndSessionDiscovery",
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
                "ssm:DescribeInstanceInformation",
                "ssm:GetConnectionStatus",
                "ssm:DescribeSessions"
            ],
            "Resource": "*"
        },
        {
            "Sid": "AllowPortForwardingSessionOnly",
            "Effect": "Allow",
            "Action": [
                "ssm:StartSession"
            ],
            "Resource": [
                f"arn:aws:ec2:{AWS_REGION}:{ACCOUNT_ID}:instance/{INSTANCE_ID}",
                f"arn:aws:ssm:{AWS_REGION}::document/AWS-StartPortForwardingSession"
            ]
        },
        {
            "Sid": "AllowManageOwnSessionsOnly",
            "Effect": "Allow",
            "Action": [
                "ssm:TerminateSession",
                "ssm:ResumeSession"
            ],
            "Resource": f"arn:aws:ssm:{AWS_REGION}:{ACCOUNT_ID}:session/openchat-operator-*"
        }
    ]
}

def run_aws(cmd_args):
    full_cmd = ["aws"] + cmd_args + ["--profile", PROFILE, "--region", AWS_REGION, "--output", "json"]
    res = subprocess.run(full_cmd, capture_output=True, text=True)
    return res

def provision():
    print("=== Step 1: Create IAM User ===")
    res = run_aws(["iam", "create-user", "--user-name", USER_NAME])
    if res.returncode == 0:
        print(f"[+] User {USER_NAME} created.")
    elif "EntityAlreadyExists" in res.stderr:
        print(f"[*] User {USER_NAME} already exists.")
    else:
        print(f"[-] Error creating user: {res.stderr}")
        return False

    print("=== Step 2: Attach Inline AssumeRole Policy to User ===")
    res = run_aws([
        "iam", "put-user-policy",
        "--user-name", USER_NAME,
        "--policy-name", "AllowAssumeOperatorRoleOnly",
        "--policy-document", json.dumps(USER_POLICY)
    ])
    if res.returncode == 0:
        print("[+] User policy attached.")
    else:
        print(f"[-] Error putting user policy: {res.stderr}")
        return False

    print("=== Step 3: Create Operator Role ===")
    res = run_aws([
        "iam", "create-role",
        "--role-name", ROLE_NAME,
        "--assume-role-policy-document", json.dumps(TRUST_POLICY),
        "--description", "Restricted SSM operator role for OpenChat staging port-forwarding"
    ])
    if res.returncode == 0:
        print(f"[+] Role {ROLE_NAME} created.")
    elif "EntityAlreadyExists" in res.stderr:
        print(f"[*] Role {ROLE_NAME} already exists, updating assume role policy...")
        res = run_aws([
            "iam", "update-assume-role-policy",
            "--role-name", ROLE_NAME,
            "--policy-document", json.dumps(TRUST_POLICY)
        ])
        print(f"[+] Role trust policy updated: {res.returncode == 0}")
    else:
        print(f"[-] Error creating role: {res.stderr}")
        return False

    print("=== Step 4: Create and Attach Policy ===")
    res = run_aws([
        "iam", "create-policy",
        "--policy-name", POLICY_NAME,
        "--policy-document", json.dumps(ROLE_POLICY),
        "--description", "Scoped SSM port-forwarding policy for OpenChat staging"
    ])
    if res.returncode == 0:
        print(f"[+] Policy {POLICY_NAME} created.")
    elif "EntityAlreadyExists" in res.stderr:
        print(f"[*] Policy {POLICY_NAME} already exists.")
    else:
        print(f"[-] Error creating policy: {res.stderr}")
        return False

    res = run_aws([
        "iam", "attach-role-policy",
        "--role-name", ROLE_NAME,
        "--policy-arn", POLICY_ARN
    ])
    if res.returncode == 0:
        print(f"[+] Policy {POLICY_ARN} attached to {ROLE_NAME}.")
    else:
        print(f"[-] Error attaching policy: {res.stderr}")
        return False

    return True

def simulate_tests():
    print("\n=== Step 5: IAM Policy Simulation & Authorization Tests ===")
    role_arn = f"arn:aws:iam::{ACCOUNT_ID}:role/{ROLE_NAME}"

    tests = [
        {
            "name": "Port Forwarding to staging instance (Allowed)",
            "action": "ssm:StartSession",
            "resources": [
                f"arn:aws:ec2:{AWS_REGION}:{ACCOUNT_ID}:instance/{INSTANCE_ID}",
                f"arn:aws:ssm:{AWS_REGION}::document/AWS-StartPortForwardingSession"
            ],
            "expected": "allowed"
        },
        {
            "name": "Interactive Shell session (Denied)",
            "action": "ssm:StartSession",
            "resources": [
                f"arn:aws:ec2:{AWS_REGION}:{ACCOUNT_ID}:instance/{INSTANCE_ID}",
                f"arn:aws:ssm:{AWS_REGION}::document/SSM-SessionManagerRunShell"
            ],
            "expected": "denied"
        },
        {
            "name": "Port Forwarding to another instance (Denied)",
            "action": "ssm:StartSession",
            "resources": [
                f"arn:aws:ec2:{AWS_REGION}:{ACCOUNT_ID}:instance/i-99999999999999999",
                f"arn:aws:ssm:{AWS_REGION}::document/AWS-StartPortForwardingSession"
            ],
            "expected": "denied"
        },
        {
            "name": "Arbitrary command execution via SendCommand (Denied)",
            "action": "ssm:SendCommand",
            "resources": [
                f"arn:aws:ec2:{AWS_REGION}:{ACCOUNT_ID}:instance/{INSTANCE_ID}",
                f"arn:aws:ssm:{AWS_REGION}::document/AWS-RunShellScript"
            ],
            "expected": "denied"
        },
        {
            "name": "Terminate own operator session (Allowed)",
            "action": "ssm:TerminateSession",
            "resources": [
                f"arn:aws:ssm:{AWS_REGION}:{ACCOUNT_ID}:session/openchat-operator-12345678"
            ],
            "expected": "allowed"
        },
        {
            "name": "Terminate another operator session (Denied)",
            "action": "ssm:TerminateSession",
            "resources": [
                f"arn:aws:ssm:{AWS_REGION}:{ACCOUNT_ID}:session/other-operator-12345678"
            ],
            "expected": "denied"
        },
        {
            "name": "Modify EC2 infrastructure (Denied)",
            "action": "ec2:RunInstances",
            "resources": [
                f"arn:aws:ec2:{AWS_REGION}:{ACCOUNT_ID}:instance/*"
            ],
            "expected": "denied"
        }
    ]

    all_passed = True
    for t in tests:
        cmd = [
            "iam", "simulate-principal-policy",
            "--policy-source-arn", role_arn,
            "--action-names", t["action"],
            "--resource-arns"
        ] + t["resources"]
        res = run_aws(cmd)
        if res.returncode != 0:
            print(f"[-] {t['name']}: API simulation call failed: {res.stderr}")
            all_passed = False
            continue
        data = json.loads(res.stdout)
        results = data.get("EvaluationResults", [])
        decision = "denied"
        if results and all(r.get("EvalDecision") == "allowed" for r in results):
            decision = "allowed"

        passed = (decision == t["expected"])
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {t['name']}: Result={decision} (Expected={t['expected']})")
        if not passed:
            all_passed = False

    return all_passed

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "simulate":
        simulate_tests()
    else:
        if provision():
            simulate_tests()
