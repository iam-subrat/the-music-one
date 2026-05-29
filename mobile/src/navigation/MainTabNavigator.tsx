import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import HomeStackNavigator from './HomeStackNavigator';
import JamStackNavigator from './JamStackNavigator';
import { colors } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';

const Tab = createBottomTabNavigator();

function JamTabScreen() {
  const { user } = useAuth();
  if (!user) return <LoginScreen />;
  return <JamStackNavigator />;
}

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{ title: 'Search', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔍</Text> }}
      />
      <Tab.Screen
        name="JamTab"
        component={JamTabScreen}
        options={{ title: 'Jam', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🎵</Text> }}
      />
    </Tab.Navigator>
  );
}
