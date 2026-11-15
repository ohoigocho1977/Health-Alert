import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { RiskMap } from '../components/RiskMap';
import { StatusTag, classificationTagProps } from '../components/StatusText';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import type {
  AlertRecord,
  Community,
  CommunityDetectionResult,
  PublicMapReport,
} from '../shared/types';

export function MapPage() {
  const { selectedCommunityId, setSelectedCommunityId } = useGlobalFilter();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [reports, setReports] = useState<PublicMapReport[]>([]);
  const [detections, setDetections] = useState<CommunityDetectionResult[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMapData()
      .then((res) => {
        setCommunities(res.communities);
        setReports(res.mapReports);
        setDetections(res.detections);
        setActiveAlerts(res.activeAlerts);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load map data.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = selectedCommunityId
    ? reports.filter((r) => r.communityId === selectedCommunityId)
    : reports;

  return (
    <Layout
      title="Community Risk Map"
      subtitle="Privacy-fuzzed report clusters, statistical risk zones, and monitored water sources."
      headerActions={
        <select
          aria-label="Focus community on map"
          value={selectedCommunityId}
          onChange={(e) => setSelectedCommunityId(e.target.value)}
          className="h-9 px-3 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#0B1F3A]"
        >
          <option value="">All Communities</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-[#FEE4E2] border border-[#B42318]/30 rounded-[6px] text-[13px] text-[#B42318]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-[500px] bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-center text-[13px] text-[#4A5B70]">
            Loading geographic risk map...
          </div>
        ) : (
          <RiskMap
            communities={communities}
            reports={filteredReports}
            detections={detections}
            activeAlerts={activeAlerts}
            selectedCommunityId={selectedCommunityId || undefined}
            heightClass="h-[500px]"
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {detections.map((det) => {
            const comm = communities.find((c) => c.id === det.communityId);
            const tag = classificationTagProps(det.suggestedClassification);
            const isSelected = selectedCommunityId === det.communityId;
            return (
              <button
                key={det.communityId}
                type="button"
                onClick={() =>
                  setSelectedCommunityId(isSelected ? '' : det.communityId)
                }
                className={`text-left p-4 bg-white border rounded-[6px] transition-colors ${
                  isSelected ? 'border-[#0E7C86]' : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[#0B1F3A] truncate">
                    {det.communityName}
                  </p>
                  <span className="text-[12px] font-mono tabular-nums text-[#4A5B70]">
                    {det.recentReportCount} / 48h
                  </span>
                </div>
                <p className="text-[12px] text-[#4A5B70] mt-0.5">
                  {comm?.lga}, {comm?.state}
                </p>
                <div className="mt-3">
                  <StatusTag label={tag.label} tone={tag.tone} showShape={tag.showShape} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
