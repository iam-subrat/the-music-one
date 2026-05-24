import posthog from 'posthog-js';

export function initAnalytics(apiKey) {
  if (!apiKey) return;
  posthog.init(apiKey, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
  });
}

export function useAnalytics() {
  return {
    capture: (event, props = {}) => posthog.capture(event, props),
    identify: (userId, traits = {}) => posthog.identify(String(userId), traits),
    reset: () => posthog.reset(),
  };
}
