export type StatusTone = 'high' | 'elevated' | 'verified' | 'ai' | 'statistical' | 'neutral';

const TAG_STYLES: Record<StatusTone, string> = {
  high: 'bg-[#FEE4E2] text-[#B42318]',
  elevated: 'bg-[#FEF0C7] text-[#93370D]',
  verified: 'bg-[#DCFCE7] text-[#146C3B]',
  ai: 'bg-[#E0F2FE] text-[#0E7C86]',
  statistical: 'bg-[#E2E8F0] text-[#4A5B70]',
  neutral: 'bg-transparent text-[#4A5B70]',
};

const SHAPE_PREFIX: Partial<Record<StatusTone, string>> = {
  high: '●',
  elevated: '▲',
  verified: '✓',
};

export function StatusTag({
  label,
  tone = 'statistical',
  showShape = true,
  className = '',
}: {
  label: string;
  tone?: StatusTone;
  showShape?: boolean;
  className?: string;
}) {
  const shape = showShape ? SHAPE_PREFIX[tone] : undefined;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[12px] font-medium whitespace-nowrap leading-5 ${TAG_STYLES[tone]} ${className}`}
    >
      {shape && <span aria-hidden="true" className="text-[10px] leading-none">{shape}</span>}
      <span>{label}</span>
    </span>
  );
}

export function StatusText({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'nominal' | 'watch' | 'warning' | 'critical';
}) {
  const mapped: StatusTone =
    tone === 'critical'
      ? 'high'
      : tone === 'warning' || tone === 'watch'
        ? 'elevated'
        : tone === 'nominal'
          ? 'verified'
          : 'statistical';

  return <StatusTag label={label} tone={mapped} />;
}

export function verificationTagProps(status: string): { label: string; tone: StatusTone; showShape: boolean } {
  switch (status) {
    case 'verified':
      return { label: 'Verified', tone: 'verified', showShape: true };
    case 'resolved':
      return { label: 'Resolved', tone: 'verified', showShape: true };
    case 'under_review':
      return { label: 'Assigned', tone: 'ai', showShape: false };
    case 'unconfirmed':
      return { label: 'Unconfirmed', tone: 'statistical', showShape: false };
    default:
      return { label: 'Awaiting', tone: 'elevated', showShape: false };
  }
}

export function classificationTagProps(classification: string): { label: string; tone: StatusTone; showShape: boolean } {
  switch (classification) {
    case 'officially_confirmed_outbreak':
      return { label: 'Outbreak', tone: 'high', showShape: true };
    case 'human_verified_incident':
      return { label: 'High', tone: 'high', showShape: true };
    case 'potential_health_threat':
      return { label: 'Elevated', tone: 'elevated', showShape: true };
    case 'unusual_reporting_activity':
      return { label: 'Elevated', tone: 'elevated', showShape: true };
    default:
      return { label: 'Normal', tone: 'neutral', showShape: false };
  }
}

export function verificationTone(status: string): 'neutral' | 'nominal' | 'watch' | 'warning' | 'critical' {
  switch (status) {
    case 'verified':
    case 'resolved':
      return 'nominal';
    case 'under_review':
      return 'watch';
    case 'unconfirmed':
      return 'neutral';
    default:
      return 'warning';
  }
}

export function classificationTone(classification: string): 'neutral' | 'nominal' | 'watch' | 'warning' | 'critical' {
  switch (classification) {
    case 'officially_confirmed_outbreak':
      return 'critical';
    case 'human_verified_incident':
    case 'potential_health_threat':
      return 'warning';
    case 'unusual_reporting_activity':
      return 'watch';
    default:
      return 'nominal';
  }
}
