import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Custom HTML shell for web — constrains the app to a 390×844 phone
 * frame centred on a grey canvas, matching the design mockup exactly.
 * Only used on web; has no effect on native.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/* Resets scroll-view default styles for web */}
        <ScrollViewStyleReset />

        {/* Google Fonts — mirrors the fonts loaded via expo-font on native */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;700;800&family=Inter:wght@400;500;700&family=Work+Sans:wght@400;700&display=swap"
          rel="stylesheet"
        />

        <style dangerouslySetInnerHTML={{ __html: WEB_STYLES }} />
      </head>
      <body>
        {/* Phone shell — wraps the React root */}
        <div id="phone-shell">
          {/* Dynamic island */}
          <div id="dynamic-island" />

          {/* Status bar */}
          <div id="status-bar">
            <span id="status-time" />
            <div id="status-icons">
              {/* Signal bars */}
              <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
                <rect x="0"    y="8"  width="3" height="4"  rx="1" fill="#111" />
                <rect x="4.5"  y="5"  width="3" height="7"  rx="1" fill="#111" />
                <rect x="9"    y="2"  width="3" height="10" rx="1" fill="#111" />
                <rect x="13.5" y="0"  width="3" height="12" rx="1" fill="#111" />
              </svg>
              {/* WiFi */}
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                <path d="M8 2.5C10.2 2.5 12.1 3.5 13.4 5L15 3.4C13.2 1.3 10.7 0 8 0C5.3 0 2.8 1.3 1 3.4L2.6 5C3.9 3.5 5.8 2.5 8 2.5Z" fill="#111"/>
                <path d="M8 5.5C9.4 5.5 10.7 6.1 11.6 7.1L13.2 5.5C11.9 4.1 10.1 3.2 8 3.2C5.9 3.2 4.1 4.1 2.8 5.5L4.4 7.1C5.3 6.1 6.6 5.5 8 5.5Z" fill="#111"/>
                <circle cx="8" cy="10" r="2" fill="#111"/>
              </svg>
              {/* Battery */}
              <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
                <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="#111" strokeOpacity="0.35"/>
                <rect x="2"   y="2"   width="16" height="8"  rx="2"   fill="#111"/>
                <path d="M23 4.5V7.5C23.8 7.2 24.5 6.5 24.5 6C24.5 5.5 23.8 4.8 23 4.5Z" fill="#111" fillOpacity="0.4"/>
              </svg>
            </div>
          </div>

          {/* React Native Web mounts here */}
          {children}
        </div>

        {/* Label below phone */}
        <p id="preview-label">Hadaf · Preview</p>

        {/* Inject live time into status bar */}
        <script dangerouslySetInnerHTML={{ __html: TIME_SCRIPT }} />
      </body>
    </html>
  );
}

const WEB_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background-color: #e2e2e2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    font-family: 'Inter', sans-serif;
  }

  /* The phone shell */
  #phone-shell {
    position: relative;
    width: 390px;
    height: 844px;
    background: #ffffff;
    border-radius: 48px;
    overflow: hidden;
    box-shadow:
      0 0 0 1.5px #111111,
      0 40px 100px rgba(0,0,0,0.30),
      0 8px 24px rgba(0,0,0,0.12);
    flex-shrink: 0;
  }

  /* React Native Web root — must fill the shell exactly */
  #phone-shell > div:not(#dynamic-island):not(#status-bar) {
    position: absolute !important;
    inset: 0 !important;
    width: 390px !important;
    height: 844px !important;
    overflow: hidden !important;
  }

  /* Dynamic island */
  #dynamic-island {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 120px;
    height: 34px;
    background: #111111;
    border-radius: 20px;
    z-index: 9999;
    pointer-events: none;
  }

  /* Status bar */
  #status-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 44px;
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 28px;
    pointer-events: none;
  }

  #status-time {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #111111;
    letter-spacing: 0.2px;
  }

  #status-icons {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Preview label below phone */
  #preview-label {
    margin-top: 24px;
    font-family: 'Work Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #999999;
  }
`;

// Updates the clock in the status bar every second
const TIME_SCRIPT = `
  function updateTime() {
    var el = document.getElementById('status-time');
    if (!el) return;
    var now = new Date();
    var h = String(now.getHours()).padStart(2,'0');
    var m = String(now.getMinutes()).padStart(2,'0');
    el.textContent = h + ':' + m;
  }
  updateTime();
  setInterval(updateTime, 1000);
`;
