export const incidentStageDescriptions = {
  investigating: "The team is looking into the issue and its impact.",
  identified: "The cause is known and the team is working on a fix.",
  monitoring: "A fix is in place; the team is watching for recovery.",
  resolved: "The issue is over. This closes a manual incident; monitor incidents recover from checks.",
} as const;
