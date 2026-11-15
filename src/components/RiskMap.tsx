import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CLASSIFICATION_LABELS,
  SYMPTOM_LABELS,
  type AlertRecord,
  type Community,
  type CommunityDetectionResult,
  type PublicMapReport,
} from '../shared/types';

interface RiskMapProps {
  communities: Community[];
  reports: PublicMapReport[];
  detections: CommunityDetectionResult[];
  activeAlerts: AlertRecord[];
  selectedCommunityId?: string;
  heightClass?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function RiskMap({
  communities,
  reports,
  detections,
  activeAlerts,
  selectedCommunityId,
  heightClass = 'h-[480px]',
}: RiskMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [6.51, 3.39],
      zoom: 12,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const detectionMap = new Map(detections.map((d) => [d.communityId, d]));
    const alertMap = new Map<string, AlertRecord>();
    for (const a of activeAlerts) {
      if (!alertMap.has(a.communityId)) alertMap.set(a.communityId, a);
    }

    for (const comm of communities) {
      const det = detectionMap.get(comm.id);
      const alert = alertMap.get(comm.id);
      const hasSignals = (det?.signals.length || 0) > 0;
      const color = alert ? '#B42318' : hasSignals ? '#93370D' : '#0E7C86';

      const circle = L.circle([comm.centerLat, comm.centerLng], {
        radius: comm.radiusKm * 1000,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: alert ? 0.12 : hasSignals ? 0.09 : 0.05,
      });

      const classLabel = det
        ? CLASSIFICATION_LABELS[det.suggestedClassification]
        : 'Baseline Monitoring';

      circle.bindPopup(`
        <div style="min-width:210px;font-size:12px;line-height:1.45;color:#0B1F3A;">
          <strong style="font-size:13px;">${escapeHtml(comm.name)}</strong><br/>
          <span style="color:#4A5B70;">${escapeHtml(comm.lga)}, ${escapeHtml(comm.state)}</span>
          <hr style="margin:6px 0;border-color:#E2E8F0;"/>
          <div><strong>Status:</strong> ${escapeHtml(classLabel)}</div>
          <div><strong>48h Reports:</strong> ${det?.recentReportCount ?? 0} (${det?.recentAffectedPeople ?? 0} affected)</div>
          <div><strong>Baseline:</strong> ${det?.baselineDailyMean ?? comm.baselineDailyReports}/day</div>
          ${alert ? `<div style="margin-top:4px;color:#B42318;"><strong>Active Alert:</strong> ${escapeHtml(alert.title)}</div>` : ''}
        </div>
      `);
      circle.addTo(group);

      for (const ws of comm.waterSources) {
        const wsColor =
          ws.status === 'tested_contaminated'
            ? '#B42318'
            : ws.status === 'suspected'
              ? '#93370D'
              : ws.status === 'closed_treated'
                ? '#4A5B70'
                : '#0E7C86';

        const icon = L.divIcon({
          className: 'ha-water-marker',
          html: `<div style="width:22px;height:22px;border-radius:4px;background:${wsColor};border:2px solid #ffffff;box-shadow:0 1px 3px rgba(11,31,58,0.28);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;">W</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        const wsMarker = L.marker([ws.lat, ws.lng], { icon });
        wsMarker.bindPopup(`
          <div style="min-width:190px;font-size:12px;line-height:1.45;color:#0B1F3A;">
            <strong>${escapeHtml(ws.name)}</strong><br/>
            <span style="color:#4A5B70;">Water Source · ${escapeHtml(ws.sourceType.replace('_', ' '))}</span>
            <div style="margin-top:4px;"><strong>Condition:</strong> ${escapeHtml(ws.status.replace('_', ' '))}</div>
          </div>
        `);
        wsMarker.addTo(group);
      }
    }

    for (const det of detections) {
      for (const sig of det.signals) {
        if (sig.clusterCenter) {
          const clusterCircle = L.circle([sig.clusterCenter.lat, sig.clusterCenter.lng], {
            radius: 650,
            color: '#B42318',
            dashArray: '5, 5',
            weight: 2,
            fillColor: '#B42318',
            fillOpacity: 0.14,
          });
          clusterCircle.bindPopup(`
            <div style="min-width:200px;font-size:12px;color:#0B1F3A;">
              <strong style="color:#B42318;">Detected Geographic Cluster</strong><br/>
              <span>${escapeHtml(sig.description)}</span>
            </div>
          `);
          clusterCircle.addTo(group);
        }
      }
    }

    for (const rep of reports) {
      const color =
        rep.verificationStatus === 'verified'
          ? '#146C3B'
          : rep.verificationStatus === 'under_review'
            ? '#0E7C86'
            : rep.verificationStatus === 'resolved'
              ? '#4A5B70'
              : '#93370D';

      const marker = L.circleMarker([rep.approxLat, rep.approxLng], {
        radius: Math.min(11, 5 + rep.affectedCount),
        color: '#ffffff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.88,
      });

      const symptomText = rep.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(', ');
      marker.bindPopup(`
        <div style="min-width:210px;font-size:12px;line-height:1.45;color:#0B1F3A;">
          <div style="font-weight:600;">Report ${escapeHtml(rep.id)}</div>
          <div style="color:#4A5B70;">${escapeHtml(rep.communityName)} · ${rep.isSimulated ? 'Demonstration data' : 'Submitted report'}</div>
          <hr style="margin:6px 0;border-color:#E2E8F0;"/>
          <div><strong>Symptoms:</strong> ${escapeHtml(symptomText)}</div>
          <div><strong>Severity:</strong> ${escapeHtml(rep.severity)} (${rep.affectedCount} affected)</div>
          <div><strong>Status:</strong> ${escapeHtml(rep.verificationStatus.replace('_', ' '))}</div>
          ${rep.suspectedWaterSourceLabel ? `<div><strong>Suspected Water:</strong> ${escapeHtml(rep.suspectedWaterSourceLabel)}</div>` : ''}
          <div style="margin-top:4px;font-size:11px;color:#4A5B70;">Location offset 300m–550m for household privacy.</div>
        </div>
      `);
      marker.addTo(group);
    }

    if (selectedCommunityId) {
      const target = communities.find((c) => c.id === selectedCommunityId);
      if (target) {
        map.setView([target.centerLat, target.centerLng], 14, { animate: true });
        return;
      }
    }

    if (communities.length > 0) {
      const bounds = L.latLngBounds(communities.map((c) => [c.centerLat, c.centerLng] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.25), { maxZoom: 13 });
      }
    }
  }, [communities, reports, detections, activeAlerts, selectedCommunityId]);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      <div className="px-4 py-2.5 bg-[#F4F6F8] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#4A5B70]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#146C3B] inline-block" />
            Verified
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0E7C86] inline-block" />
            Assigned
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#93370D] inline-block" />
            Awaiting
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-[4px] bg-[#0E7C86] text-white text-[10px] font-bold inline-flex items-center justify-center">
              W
            </span>
            Water Source
          </span>
        </div>
        <span>Privacy guard: coordinates include a 300m–550m anonymity offset.</span>
      </div>
    </div>
  );
}
