import React, { useEffect } from 'react';

interface TopNotificationProps {
  message: string;
  type: 'error' | 'notice';
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export default function TopNotification({
  message,
  type,
  onDismiss,
  autoDismissMs = 4000,
}: TopNotificationProps) {
  useEffect(() => {
    if (autoDismissMs > 0 && onDismiss) {
      const timer = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [autoDismissMs, onDismiss]);

  return (
    <div
      className={`top-notification ${type === 'error' ? 'error' : 'notice'}`}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 0 0 8px',
            color: 'inherit',
            opacity: 0.7,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
