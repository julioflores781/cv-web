'use client';

import { useId, useState } from 'react';
import type { AdapterStatus } from '@/lib/api/types';
import type { HexModel, HexPort } from '@/lib/architecture/model';
import { POSITIONS } from '@/lib/architecture/slots';
import { StatusShape } from './ui/status-shape';
import styles from './hex-plane.module.css';

export interface PlaneLabels {
  core: string;
  groupLabel: string;
  legend: { adapters: string; ports: string; contract: string; hint: string };
  status: Record<AdapterStatus, string>;
  /** `{port}` is replaced by the port name. */
  adapterLegend: string;
}

interface HexPlaneProps {
  model: HexModel;
  labels: PlaneLabels;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Vertices of the middle (dashed) hexagon of the design, where the contract squares sit. */
const CONTRACT_SQUARES: ReadonlyArray<readonly [number, number]> = [
  [49, 25],
  [69.8, 37],
  [69.8, 61],
  [49, 73],
  [28.2, 61],
  [28.2, 37],
];

function pointOf(slot: number | undefined): readonly [number, number] {
  return POSITIONS[slot ?? 0] ?? POSITIONS[0] ?? [50, 12];
}

function StatusLine({ labels, port, adapterIndex, id }: { labels: PlaneLabels; port: HexPort; adapterIndex: number; id: string }) {
  const adapter = port.adapters[adapterIndex] ?? port.adapters[0];
  if (!adapter) return null;
  return (
    <div className={styles.status} id={id}>
      <span className={styles.statusLabel}>
        <StatusShape status={adapter.status} />
        <span>{labels.status[adapter.status]}</span>
      </span>
      {adapter.note ? <span className={styles.note}>{adapter.note}</span> : null}
    </div>
  );
}

/**
 * Hexagonal plane of the API: the core never changes, each port is a button, and the panel shows the selected port
 * with its adapters. Island: the server HTML already shows the first port selected.
 */
export function HexPlane({ model, labels }: HexPlaneProps) {
  const uid = useId();
  const [selected, setSelected] = useState(0);
  const [choices, setChoices] = useState<number[]>(() => model.ports.map(() => 0));
  const radial = model.layout === 'radial';
  const port = model.ports[selected] ?? model.ports[0];
  if (!port) return null;
  const choice = choices[selected] ?? 0;
  const [sx, sy] = pointOf(model.slots[selected]);

  const nodes = (
    <div
      role="group"
      aria-label={labels.groupLabel}
      className={radial ? styles.groupRadial : styles.groupList}
      data-probe="nodes"
    >
      {model.ports.map((item, i) => {
        const [x, y] = pointOf(model.slots[i]);
        return (
          <button
            key={`${uid}-p${i}`}
            id={`${uid}-p${i}`}
            type="button"
            className={`${styles.node} hex`}
            aria-pressed={i === selected}
            style={radial ? { left: `${x}%`, top: `${y}%` } : undefined}
            onClick={() => setSelected(i)}
            data-probe="node"
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={styles.plane} data-layout={model.layout} data-probe="plane">
      <div className={styles.box}>
        <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true" data-probe="plano">
          <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.25" />
          <polygon points="50,12 82.9,31 82.9,69 50,88 17.1,69 17.1,31" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.3" />
          <polygon
            points="50,26 70.8,38 70.8,62 50,74 29.2,62 29.2,38"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.55"
            strokeWidth="0.3"
            strokeDasharray="1.2 1.2"
          />
          {radial
            ? model.slots.map((slot) => {
                const [x, y] = pointOf(slot);
                const [qx, qy] = CONTRACT_SQUARES[slot] ?? [49, 25];
                return (
                  <g key={slot}>
                    <line x1="50" y1="50" x2={x} y2={y} stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.25" />
                    <rect x={qx} y={qy} width="2" height="2" fill="currentColor" />
                  </g>
                );
              })
            : null}
          {radial ? <line className={styles.flow} x1={sx} y1={sy} x2="50" y2="50" data-probe="flow" /> : null}
        </svg>
        <div className={`${styles.core} hex`} data-probe="core">
          <span className={`${styles.coreTag} mono`} data-probe="core-tag">
            {labels.core}
          </span>
          {model.core.name ? (
            <span className={`${styles.coreLabel} display`} data-probe="core-label">
              {model.core.name}
            </span>
          ) : null}
        </div>
        {radial ? nodes : null}
      </div>
      {radial ? null : nodes}

      <ul className={`${styles.legend} mono`} data-probe="legend">
        <li>
          <svg className={styles.legendLine} viewBox="0 0 24 4" aria-hidden="true">
            <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {labels.legend.adapters}
        </li>
        <li>
          <svg className={styles.legendLine} viewBox="0 0 24 4" aria-hidden="true">
            <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          {labels.legend.ports}
        </li>
        <li>
          <span className={styles.legendSquare} aria-hidden="true" />
          {labels.legend.contract}
        </li>
        <li>{labels.legend.hint}</li>
      </ul>

      <div className={styles.panel} data-probe="panel" aria-live="polite" aria-atomic="true">
        <div className={`${styles.index} mono`} data-probe="panel-index">
          {`${pad(selected + 1)} / ${pad(model.ports.length)}`}
        </div>
        <div className={styles.detail}>
          <span className={`${styles.name} display`} data-probe="panel-name">
            {port.name}
          </span>
          {port.description ? (
            <span className={styles.text} data-probe="panel-text">
              {port.description}
            </span>
          ) : null}
          <div className={styles.adapters}>
            {port.adapters.length > 1 ? (
              <>
                <fieldset className={styles.choices}>
                  <legend className={styles.srOnly}>{labels.adapterLegend.replace('{port}', port.name)}</legend>
                  {port.adapters.map((adapter, j) => {
                    const id = `${uid}-p${selected}a${j}`;
                    return (
                      <label key={id} htmlFor={id} className={`${styles.chip} mono`}>
                        <input
                          id={id}
                          type="radio"
                          name={`${uid}-p${selected}`}
                          className={styles.radio}
                          checked={j === choice}
                          aria-describedby={`${uid}-p${selected}-detail`}
                          onChange={() => setChoices((previous) => previous.map((value, k) => (k === selected ? j : value)))}
                        />
                        <span>{adapter.name}</span>
                      </label>
                    );
                  })}
                </fieldset>
                {/* Without scripting the chips cannot be used: the chosen adapter is named in plain text. */}
                <span className={styles.adapterFallback}>{port.adapters[choice]?.name}</span>
              </>
            ) : (
              <span className={`${styles.adapterName} mono`}>{port.adapters[0]?.name}</span>
            )}
            <StatusLine labels={labels} port={port} adapterIndex={choice} id={`${uid}-p${selected}-detail`} />
          </div>
        </div>
      </div>

      {model.ports.map((item, i) => (
        <noscript key={`${uid}-n${i}`}>
          <div className={styles.noscript}>
            <p>{item.name}</p>
            <ul>
              {item.adapters.map((adapter, j) => (
                <li key={`${uid}-n${i}a${j}`}>
                  {adapter.name} · {labels.status[adapter.status]}
                  {adapter.note ? ` · ${adapter.note}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </noscript>
      ))}
    </div>
  );
}
