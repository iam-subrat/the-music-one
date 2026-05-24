import posthog from 'posthog-js';

export function initAnalytics(apiKey) {
  if (!apiKey) return;
  posthog.init(apiKey, {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
  });
  posthog.register({
    environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
  });
}

export function useAnalytics() {
  return {
    capture: (event, props = {}) => posthog.capture(event, props),
    identify: (userId, traits = {}) => posthog.identify(String(userId), traits),
    reset: () => posthog.reset(),
  };
}
