import Constants from 'expo-constants';

export const API_BASE = (
  Constants.expoConfig?.extra?.apiUrl ?? ''
).replace(/\/$/, '');

export const WEB_BASE = (
  Constants.expoConfig?.extra?.webUrl ?? 'https://staging.themusic.one'
).replace(/\/$/, '');
