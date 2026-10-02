package com.eeennsu.spendback

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "spendback"

  /**
   * react-native-screens는 화면 상태를 스스로 되살리지 않는다. 시스템이 프로세스를 되살릴 때 저장된 Fragment를 다시
   * 붙이다 죽지 않도록 저장 상태를 넘기지 않는다(react-native-screens 설치 안내)
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
