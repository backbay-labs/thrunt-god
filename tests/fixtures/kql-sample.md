# Network Service Discovery T1046

Detect network service scanning using DeviceNetworkEvents.

## KQL Query

```kql
DeviceNetworkEvents
| where RemotePort in (22, 23, 80, 443, 445, 3389)
| summarize PortCount = dcount(RemotePort) by DeviceName, RemoteIP
| where PortCount > 3
```

## References

- MITRE ATT&CK T1046
- Related: T1135
