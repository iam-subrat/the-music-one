import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import JamLobbyScreen from '../screens/JamLobbyScreen';
import JamRoomScreen from '../screens/JamRoomScreen';
import { colors } from '../constants/theme';

export type JamStackParamList = {
  JamLobby: undefined;
  JamRoom: { code: string };
};

const Stack = createNativeStackNavigator<JamStackParamList>();

export default function JamStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }}>
      <Stack.Screen name="JamLobby" component={JamLobbyScreen} options={{ title: 'Jam Session' }} />
      <Stack.Screen name="JamRoom" component={JamRoomScreen} options={{ title: 'Jam Room' }} />
    </Stack.Navigator>
  );
}
