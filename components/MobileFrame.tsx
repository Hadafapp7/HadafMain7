/**
 * MobileFrame
 * Web-only wrapper that constrains the app to a 390×844 phone
 * shell centred on screen, matching the iPhone design canvas.
 * On native this renders children directly with no wrapping.
 */
import { Platform } from 'react-native';

interface Props { children: React.ReactNode }

export function MobileFrame({ children }: Props) {
  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: '#e8e8e8',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Phone shell */}
      <div
        style={{
          width: 390,
          height: 844,
          backgroundColor: '#ffffff',
          borderRadius: 48,
          overflow: 'hidden',
          position: 'relative',
          boxShadow:
            '0 0 0 1.5px #111111, 0 32px 80px rgba(0,0,0,0.35)',
        }}
      >
        {/* Status bar strip */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 44,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 28,
            paddingRight: 28,
            backgroundColor: 'transparent',
          }}
        >
          {/* Time */}
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#111111' }}>
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
          {/* Status icons */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
              <rect x="0" y="4" width="3" height="8" rx="1" fill="#111"/>
              <rect x="4.5" y="2.5" width="3" height="9.5" rx="1" fill="#111"/>
              <rect x="9" y="1" width="3" height="11" rx="1" fill="#111"/>
              <rect x="13.5" y="0" width="3" height="12" rx="1" fill="#111"/>
            </svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <path d="M8 2.5C10.2 2.5 12.1 3.5 13.4 5L15 3.4C13.2 1.3 10.7 0 8 0C5.3 0 2.8 1.3 1 3.4L2.6 5C3.9 3.5 5.8 2.5 8 2.5Z" fill="#111"/>
              <path d="M8 5.5C9.4 5.5 10.7 6.1 11.6 7.1L13.2 5.5C11.9 4.1 10.1 3.2 8 3.2C5.9 3.2 4.1 4.1 2.8 5.5L4.4 7.1C5.3 6.1 6.6 5.5 8 5.5Z" fill="#111"/>
              <circle cx="8" cy="10" r="2" fill="#111"/>
            </svg>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
              <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="#111" strokeOpacity="0.35"/>
              <rect x="2" y="2" width="16" height="8" rx="2" fill="#111"/>
              <path d="M23 4.5V7.5C23.8 7.2 24.5 6.5 24.5 6C24.5 5.5 23.8 4.8 23 4.5Z" fill="#111" fillOpacity="0.4"/>
            </svg>
          </div>
        </div>

        {/* Dynamic island */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 120,
            height: 34,
            backgroundColor: '#111111',
            borderRadius: 20,
            zIndex: 20,
          }}
        />

        {/* App content */}
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
          {children}
        </div>
      </div>

      {/* Label below phone */}
      <p
        style={{
          position: 'absolute',
          bottom: 24,
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#777777',
          fontWeight: 600,
        }}
      >
        Hadaf · Preview
      </p>
    </div>
  );
}
