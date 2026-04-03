import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'Manrope-Light', fontSize: 32, color: '#111111', letterSpacing: -0.8 }}>
        Profile
      </Text>
      <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, color: '#777777', marginTop: 8 }}>
        Coming soon
      </Text>
    </View>
  );
}
