import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import RootNavigator from './src/navigation/RootNavigator';
import { RootStackParamList } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/contexts/AuthContext';

const prefix = Linking.createURL('/');
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, 'musicone://'],
  config: {
    screens: {
      Main: {
        screens: {
          JamTab: {
            screens: {
              JamRoom: 'jam/:code',
            },
          },
        },
      },
      Login: 'login',
    },
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer linking={linking}>
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
