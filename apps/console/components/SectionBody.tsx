import {
  ConsentScopePicker,
  InvestigationTimeline,
  PlatformCoverage,
  PrivacyControl,
  ResourceUsagePanel,
  RiskEvidenceCard,
  type PatternState,
} from "@sovir/ui-web/patterns";

export function SectionBody({
  path,
  state,
}: {
  path: string;
  state: PatternState;
}) {
  if (path === "/incidents" || path === "/") {
    return <RiskEvidenceCard state={state} />;
  }
  if (path === "/permissions" || path === "/protections") {
    return <ConsentScopePicker state={state} />;
  }
  if (path === "/investigations") {
    return <InvestigationTimeline state={state} />;
  }
  if (path === "/resources" || path === "/enterprise/billing") {
    return <ResourceUsagePanel state={state} />;
  }
  if (path === "/devices" || path === "/enterprise/integrations") {
    return <PlatformCoverage state={state} />;
  }
  return <PrivacyControl state={state} />;
}
