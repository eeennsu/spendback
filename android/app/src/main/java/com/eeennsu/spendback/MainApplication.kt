package com.eeennsu.spendback

import android.app.Application
import com.eeennsu.spendback.files.SpendbackFilesPackage
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // 앱 전용 Turbo Native Module(모델 내려받기, 백업 파일)
          add(SpendbackFilesPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // DS native 래퍼의 --font-sans(Pretendard, DS 스펙 C-7b R26)가 이 이름으로 풀린다. 무게는 res/font/pretendard.xml에서 고른다
    ReactFontManager.getInstance().addCustomFont(this, "Pretendard", R.font.pretendard)
    loadReactNative(this)
  }
}
