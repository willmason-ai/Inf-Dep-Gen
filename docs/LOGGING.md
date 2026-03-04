# Audit Logging & AI Chat History

All actions taken by Infrastructure Deployment Generator are logged to Azure Cosmos DB. Logs are append-only and cannot be modified or deleted through the application.

## Log Types

### 1. AI Chat Logs

Every AI conversation is recorded in the `chatHistory` container.

**Schema:**

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "userId": "user@domain.com",
  "timestamp": "2026-03-01T14:30:00Z",
  "role": "user | assistant | system",
  "content": "The full message text",
  "metadata": {
    "tokensUsed": 150,
    "modelVersion": "model-id",
    "responseTimeMs": 1200,
    "guardrailsTriggered": ["G-APR-001"],
    "operationsRequested": ["vm-resize"],
    "operationsApproved": true
  }
}
```

**Retention**: 1 year (configurable via Cosmos DB TTL)

**What is logged:**
- Every user message sent to the AI
- Every AI response
- System messages (guardrail warnings, errors)
- Which guardrails were triggered
- Whether operations were approved or denied
- Token usage and response times

### 2. Infrastructure Change Audit Log

Every change to Azure resources is recorded in the `auditLog` container.

**Schema:**

```json
{
  "id": "uuid",
  "timestamp": "2026-03-01T14:32:00Z",
  "changeType": "vm-resize | disk-resize | disk-type-change | vm-power | vm-restart",
  "userId": "user@domain.com",
  "initiatedBy": "dashboard | ai-chat",
  "resourceId": "/subscriptions/.../resourceGroups/.../providers/Microsoft.Compute/virtualMachines/vm-name",
  "resourceGroup": "rg-name",
  "vmName": "vm-name",
  "previousState": {
    "sku": "Standard_D2s_v3",
    "diskSizeGB": 128,
    "diskType": "Premium_LRS",
    "powerState": "running"
  },
  "newState": {
    "sku": "Standard_D4s_v3",
    "diskSizeGB": 128,
    "diskType": "Premium_LRS",
    "powerState": "running"
  },
  "approvalId": "uuid-of-approval-record",
  "guardrailsEvaluated": ["G-APR-001", "G-SKU-001"],
  "result": "success | failed | blocked",
  "errorMessage": null,
  "sessionId": "uuid-of-ai-session-if-applicable"
}
```

**Retention**: 3 years (regulatory/compliance requirement — configurable)

**What is logged:**
- The exact before and after state of every change
- Who initiated the change and through which interface
- Which guardrails were evaluated
- Whether the change succeeded or failed
- The AI session ID if the change was initiated through chat
- Full Azure resource ID for traceability

### 3. Access Audit Log

Login and access events are recorded.

**Schema:**

```json
{
  "id": "uuid",
  "timestamp": "2026-03-01T14:00:00Z",
  "eventType": "login | logout | session-start | session-timeout",
  "userId": "user@domain.com",
  "ipAddress": "10.x.x.x",
  "userAgent": "browser-info",
  "result": "success | failed"
}
```

---

## Querying Logs

The application provides API endpoints and a dashboard view for querying logs:

| Endpoint | Parameters | Description |
|----------|-----------|-------------|
| `GET /api/logs/audit` | `startDate`, `endDate`, `vmName`, `userId`, `changeType` | Query change audit logs |
| `GET /api/logs/chat` | `sessionId`, `userId`, `startDate`, `endDate` | Query AI chat history |
| `GET /api/logs/access` | `userId`, `startDate`, `endDate` | Query access logs |

### Dashboard Log View

The dashboard includes a log viewer with:
- Filterable/sortable table of recent changes
- Drill-down to see full change details including before/after state
- AI chat session replay (view the full conversation that led to a change)
- Export to CSV for reporting

---

## Log Integrity

- Logs are stored in Cosmos DB with **no delete permissions** granted to the application's service principal
- The Cosmos DB account uses **continuous backup** to prevent data loss
- Log entries include a hash of the previous entry for tamper detection (optional, implementation TBD)
- Cosmos DB diagnostic settings forward logs to Azure Monitor for independent retention

## Alerting

Alerts are configured for:

| Condition | Severity | Action |
|-----------|----------|--------|
| Guardrail BLOCKED rule triggered | Warning | Log + notify ops team |
| Failed VM operation | Error | Log + notify ops team |
| >5 guardrail triggers in 1 hour | High | Log + notify ops team + review |
| AI rate limit exceeded | Warning | Log + notify user |
| Authentication failure | High | Log + notify security team |
