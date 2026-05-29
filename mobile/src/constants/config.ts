import Constants from 'expo-constants';

export const API_BASE = (
  Constants.expoConfig?.extra?.apiUrl ?? ''
).replace(/\/$/, '');
