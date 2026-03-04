# Incident Response Runbook

## Scenario 1: Unauthorized or Unintended VM Change

**Symptoms**: A VM was resized, stopped, or modified unexpectedly.

**Steps**:
1. Check the audit log: `GET /api/logs/audit?vmName={name}&startDate={recent}`
2. Identify who initiated the change and through which interface (dashboard vs AI chat)
3. If initiated through AI chat, replay the session: `GET /api/logs/chat?sessionId={id}`
4. If the change was unauthorized:
   - Revert the VM to its previous state using the `previousState` from the audit log
   - Disable the user's access if compromised
   - File an incident report

## Scenario 2: Service Principal Compromise

**Symptoms**: Unexpected Azure activity from the service principal.

**Steps**:
1. **Immediately** disable the service principal:
   ```bash
   az ad sp update --id {app-id} --set accountEnabled=false
   ```
2. Rotate the client secret (if using secret-based auth)
3. Review Azure Activity Log for all actions taken by the SP
4. Review application audit logs for the same period
5. Re-enable with new credentials after investigation

## Scenario 3: Guardrail Bypass Detected

**Symptoms**: An operation that should have been blocked was executed.

**Steps**:
1. Identify the operation from audit logs
2. Check which guardrails were evaluated (`guardrailsEvaluated` field)
3. Determine if the rule was missing, misconfigured, or bypassed
4. Revert the change if harmful
5. Update guardrail rules to close the gap
6. Deploy the fix immediately

## Scenario 4: AI Producing Harmful Recommendations

**Symptoms**: The AI suggests or executes operations that could cause outages.

**Steps**:
1. Review the AI chat session that led to the recommendation
2. Disable AI-initiated operations temporarily:
   - Set `AI_OPERATIONS_ENABLED=false` in app config
3. Review and strengthen AI conversation guardrails (G-AI-* rules)
4. Add the specific pattern to the blocked operations list
5. Re-enable after testing

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|-----------|
| Application Owner | TBD | First contact |
| Azure Admin | TBD | SP disable, subscription-level actions |
| Security Team | TBD | Credential compromise, unauthorized access |
