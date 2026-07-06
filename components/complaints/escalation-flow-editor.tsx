"use client";

import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { COMPLAINT_DRAFT_KINDS, ESCALATION_DRAFT_KINDS, type ComplaintDraftKind } from "@/lib/constants";
import { updateEscalationFlowConfigAction, updateEscalationFlowPositionAction } from "@/lib/actions/escalation-flow";
import type { EscalationFlowConfig } from "@/lib/queries";

interface StageNodeData {
  label: string;
  slaDays: number | null;
  slaUnit: "calendar" | "working" | null;
  onElapseDraftKind: string | null;
  count: number;
  editable: boolean;
  [key: string]: unknown;
}

function slaText(days: number | null, unit: string | null): string | null {
  if (!days || !unit) return null;
  return `${days} ${unit} day${days === 1 ? "" : "s"}`;
}

function StageNodeComponent({ data }: NodeProps<Node<StageNodeData>>) {
  const draftLabel = data.onElapseDraftKind ? COMPLAINT_DRAFT_KINDS[data.onElapseDraftKind as ComplaintDraftKind] : null;
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card px-4 py-3 shadow-sm min-w-[210px] transition-shadow",
        data.editable ? "border-primary/40 cursor-pointer hover:shadow-md" : "border-dashed border-slate-300 dark:border-slate-700 opacity-80",
      )}
    >
      {data.editable && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">{data.label}</span>
        {data.count > 0 && (
          <Badge variant="warning" className="text-[10px]">
            {data.count} case{data.count === 1 ? "" : "s"}
          </Badge>
        )}
      </div>
      {slaText(data.slaDays, data.slaUnit) && (
        <p className="text-[11px] text-muted-foreground mt-1.5">
          No reply for {slaText(data.slaDays, data.slaUnit)} →
        </p>
      )}
      {draftLabel ? (
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">drafts: {draftLabel}</p>
      ) : data.editable ? (
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">drafts: Lokayukta + Chief Secretary + CM office</p>
      ) : null}
      {data.editable && <Handle type="source" position={Position.Right} />}
      {!data.editable && (
        <>
          <Handle type="target" position={Position.Left} />
          <Handle type="source" position={Position.Right} />
        </>
      )}
    </div>
  );
}

const NODE_TYPES = { stage: StageNodeComponent };

const PSEUDO_GAP = 260;

function buildNodesAndEdges(configs: EscalationFlowConfig[], counts: Record<string, number>): { nodes: Node<StageNodeData>[]; edges: Edge[] } {
  const byKey = new Map(configs.map((c) => [c.stageKey, c]));
  const awaitingReply = byKey.get("awaiting_reply");
  const legalNotice = byKey.get("legal_notice_sent");

  const nodes: Node<StageNodeData>[] = [
    {
      id: "awaiting_ack",
      type: "stage",
      draggable: false,
      position: { x: (awaitingReply?.positionX ?? 0) - PSEUDO_GAP, y: awaitingReply?.positionY ?? 0 },
      data: { label: "Filed — awaiting acknowledgment", slaDays: null, slaUnit: null, onElapseDraftKind: null, count: counts.awaiting_ack ?? 0, editable: false },
    },
    ...configs.map((c) => ({
      id: c.stageKey,
      type: "stage",
      draggable: true,
      position: { x: c.positionX, y: c.positionY },
      data: {
        label: c.label,
        slaDays: c.slaDays,
        slaUnit: c.slaUnit,
        onElapseDraftKind: c.onElapseDraftKind,
        count: counts[c.stageKey] ?? 0,
        editable: true,
      },
    })),
    {
      id: "escalated",
      type: "stage",
      draggable: false,
      position: { x: (legalNotice?.positionX ?? 520) + PSEUDO_GAP, y: legalNotice?.positionY ?? 0 },
      data: { label: "Escalated (Lokayukta / CS / CM)", slaDays: null, slaUnit: null, onElapseDraftKind: null, count: counts.escalated ?? 0, editable: false },
    },
  ];

  const edges: Edge[] = [
    { id: "e-ack-reply", source: "awaiting_ack", target: "awaiting_reply", label: "OC copy uploaded", type: "smoothstep" },
    ...configs.map((c) => ({
      id: `e-${c.stageKey}-${c.onElapseNextStage}`,
      source: c.stageKey,
      target: c.onElapseNextStage,
      label: slaText(c.slaDays, c.slaUnit) ? `${slaText(c.slaDays, c.slaUnit)}, no reply` : undefined,
      type: "smoothstep",
      animated: true,
    })),
  ];

  return { nodes, edges };
}

function StageEditPanel({
  config,
  onClose,
}: {
  config: EscalationFlowConfig;
  onClose: () => void;
}) {
  const [label, setLabel] = React.useState(config.label);
  const [slaDays, setSlaDays] = React.useState(String(config.slaDays ?? ""));
  const [slaUnit, setSlaUnit] = React.useState(config.slaUnit ?? "working");
  const [draftKind, setDraftKind] = React.useState(config.onElapseDraftKind ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isTerminalStage = config.onElapseNextStage === "escalated";

  async function save() {
    setSaving(true);
    setError(null);
    const r = await updateEscalationFlowConfigAction(config.stageKey, {
      label,
      slaDays: slaDays ? parseInt(slaDays, 10) : null,
      slaUnit,
      onElapseDraftKind: draftKind || null,
    });
    setSaving(false);
    if (r.error) setError(r.error);
    else onClose();
  }

  return (
    <div className="w-72 shrink-0 rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Edit stage</h3>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">SLA days</Label>
          <Input type="number" min={1} value={slaDays} onChange={(e) => setSlaDays(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Unit</Label>
          <select
            value={slaUnit}
            onChange={(e) => setSlaUnit(e.target.value as "calendar" | "working")}
            className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <option value="working">Working days</option>
            <option value="calendar">Calendar days</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Auto-draft letter kind</Label>
        <select
          value={draftKind}
          onChange={(e) => setDraftKind(e.target.value)}
          className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {isTerminalStage && <option value="">Multiple — human picks (Lokayukta / CS / CM)</option>}
          {ESCALATION_DRAFT_KINDS.map((k) => (
            <option key={k} value={k}>{COMPLAINT_DRAFT_KINDS[k]}</option>
          ))}
        </select>
        {isTerminalStage && (
          <p className="text-[10px] text-muted-foreground">Leave as &quot;Multiple&quot; to auto-draft all three escalation letters and let a human choose which to send.</p>
        )}
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <Button onClick={save} disabled={saving} className="w-full h-9">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
      </Button>
    </div>
  );
}

/**
 * Drag-drop editor for the escalation ladder (escalation_flow_configs,
 * migration 0031) — this IS the ladder's configuration, not just a picture of
 * it: the scheduler (lib/complaints/escalation-scheduler.ts) reads the exact
 * same rows. Dragging a node persists its canvas position (cosmetic); clicking
 * a real stage opens the side panel to edit its SLA / draft kind / label,
 * which changes what the scheduler actually does next.
 */
export function EscalationFlowEditor({
  configs,
  counts,
}: {
  configs: EscalationFlowConfig[];
  counts: Record<string, number>;
}) {
  const built = React.useMemo(() => buildNodesAndEdges(configs, counts), [configs, counts]);
  const [nodes, , onNodesChange] = useNodesState(built.nodes);
  const [edges, , onEdgesChange] = useEdgesState(built.edges);
  const [selectedStage, setSelectedStage] = React.useState<string | null>(null);

  const onNodeDragStop = React.useCallback((_e: unknown, node: Node) => {
    void updateEscalationFlowPositionAction(node.id, node.position.x, node.position.y);
  }, []);

  const onNodeClick = React.useCallback((_e: unknown, node: Node<StageNodeData>) => {
    if (node.data.editable) setSelectedStage(node.id);
  }, []);

  const selectedConfig = configs.find((c) => c.stageKey === selectedStage) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex gap-4 h-[65vh]">
        <div className="flex-1 rounded-xl border bg-card overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        {selectedConfig && <StageEditPanel config={selectedConfig} onClose={() => setSelectedStage(null)} />}
      </div>
      <p className="text-xs text-muted-foreground">
        A department reply at any stage halts the ladder immediately. Filing our counter-reply restarts it from &quot;Awaiting reply&quot; for the next round.
        Drag a stage to reposition it; click a stage to edit its SLA or which letter it auto-drafts.
      </p>
    </div>
  );
}
