import json
import os
import urllib.request
import boto3

_secret = None

def token():
    global _secret
    if _secret is None:
        value = boto3.client("secretsmanager").get_secret_value(SecretId=os.environ["SOURCE_SECRET_ARN"])
        _secret = json.loads(value["SecretString"])["token"]
    return _secret

def handler(event, context):
    body = json.dumps(event).encode()
    request = urllib.request.Request(
        os.environ["CALYX_CLOUDWATCH_URL"],
        data=body,
        method="POST",
        headers={"authorization": f"Bearer {token()}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status >= 300:
            raise RuntimeError(f"Calyx returned HTTP {response.status}")
    return {"ok": True}
