package com.eeennsu.spendback.files

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** 앱 전용 Turbo Native Module 등록(MainApplication) */
class SpendbackFilesPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == SpendbackFilesModule.NAME) SpendbackFilesModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        SpendbackFilesModule.NAME to
            ReactModuleInfo(
                name = SpendbackFilesModule.NAME,
                className = SpendbackFilesModule.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            ))
  }
}
