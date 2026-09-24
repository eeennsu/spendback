import { StyleSheet, Text, View } from 'react-native';

// 부트스트랩용 임시 화면. UI는 디자인 시스템 연동(PRD 12장 3번) 뒤에 만든다.
export default function App() {
  return (
    <View style={styles.root}>
      <Text>spendback</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
