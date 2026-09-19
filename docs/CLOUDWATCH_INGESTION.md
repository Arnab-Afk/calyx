# CloudWatch Logs ingestion

Calyx accepts the standard CloudWatch Logs subscription envelope through a tenant-bound source token. A small AWS Lambda subscription destination forwards the envelope; tenant identity is never accepted from the AWS payload.

## Create the source

```bash
calyx sources create \
  --project <project> \
  --provider cloudwatch \
  --role backend \
  --service <service>
```

Save the one-time token and drain URL. Configure them as Lambda environment variables `CALYX_SOURCE_TOKEN` and `CALYX_CLOUDWATCH_URL`.

## Forwarding Lambda

Use the Node.js 22 runtime with this handler:

```js
export const handler = async (event) => {
  const response = await fetch(process.env.CALYX_CLOUDWATCH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.CALYX_SOURCE_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) throw new Error(`Calyx returned ${response.status}: ${await response.text()}`);
};
```

Store `CALYX_SOURCE_TOKEN` in AWS Secrets Manager or encrypted Lambda configuration, not source code. Give the Lambda no permissions beyond basic CloudWatch logging. Allow outbound HTTPS to the Calyx ingestion hostname.

Create a CloudWatch Logs subscription filter for each desired log group with the Lambda as its destination. AWS sends a gzip-compressed, base64-encoded `awslogs.data` envelope. Calyx limits compressed payloads to 1 MiB and decompressed payloads to 5 MiB.

## Normalization

Each CloudWatch log event becomes a Calyx event with the source's canonical tenant and service plus:

- AWS account ID
- log group and stream
- CloudWatch event ID
- subscription filter names
- project, source, and source-role identifiers

JSON `level` or `severity` fields are used when present; common plain-text fatal, error, warning, and debug markers are also recognized. AWS control messages are accepted without creating events.

Verify delivery with:

```bash
calyx sources status --project <project> --wait 60
```
