import React from 'react';
import type { TFunction } from 'i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RoutingEntry } from '../lib/configStore';
import { getProviderDisplayName } from '../lib/providerDisplay';

interface SortableRoutingItemProps {
  entry: RoutingEntry;
  index: number;
  totalInGroup: number;
  isPrimary: boolean;
  configInfo: Map<
    string,
    { remark?: string; apiKeyMasked?: string; baseUrl?: string }
  >;
  onMove: (entry: RoutingEntry, direction: 'up' | 'down') => void;
  onTogglePrimary: (
    provider: string,
    model: string,
    configId: string,
    currentIsPrimary: boolean,
  ) => void;
  onRemove: (provider: string, model: string, configId: string) => void;
  t: TFunction;
}

export default function SortableRoutingItem({
  entry,
  index,
  totalInGroup,
  isPrimary,
  configInfo,
  onMove,
  onTogglePrimary,
  onRemove,
  t,
}: SortableRoutingItemProps) {
  const id = `${entry.provider}:${entry.model}:${entry.configId}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.3, zIndex: 1 } : {}),
  };

  const info = configInfo.get(entry.configId);
  const isFirst = index === 0;
  const isLast = index === totalInGroup - 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-flip-id={`${entry.provider}-${entry.model}-${entry.configId}`}
      className={`routing-item${isPrimary ? ' is-primary' : ''}${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="routing-info">
        <span className="routing-provider">
          {getProviderDisplayName(entry.provider, t)}
        </span>
        <span className="routing-separator">/</span>
        <span className="routing-model">{entry.model}</span>
        {info?.remark && (
          <span className="routing-config-info">({info.remark})</span>
        )}
      </div>
      <div className="routing-actions">
        {isPrimary && (
          <span className="move-buttons">
            <button
              className="move-btn"
              onClick={() => onMove(entry, 'up')}
              disabled={isFirst}
              title="Move up"
            >
              ↑
            </button>
            <button
              className="move-btn"
              onClick={() => onMove(entry, 'down')}
              disabled={isLast}
              title="Move down"
            >
              ↓
            </button>
          </span>
        )}
        <button
          className="secondary small"
          onClick={() =>
            onTogglePrimary(
              entry.provider,
              entry.model,
              entry.configId,
              entry.isPrimary ?? false,
            )
          }
        >
          {isPrimary
            ? t('common.removePrimary')
            : t('common.setAsPrimary')}
        </button>
        <button
          className="routing-delete"
          onClick={() =>
            onRemove(entry.provider, entry.model, entry.configId)
          }
          title={t('common.removeFromRouting')}
        >
          ×
        </button>
        <span
          className={`drag-handle${!isPrimary ? ' drag-handle--hidden' : ''}`}
          aria-hidden="true"
          title={t('common.dragToReorder') as string}
        >
          ≡
        </span>
      </div>
    </div>
  );
}
