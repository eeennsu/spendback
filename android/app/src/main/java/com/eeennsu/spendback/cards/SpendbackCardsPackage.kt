package com.eeennsu.spendback.cards

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** 앱 전용 Turbo Native Module 등록(MainApplication) */
class SpendbackCardsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == SpendbackCardsModule.NAME) SpendbackCardsModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        SpendbackCardsModule.NAME to
            ReactModuleInfo(
                name = SpendbackCardsModule.NAME,
                className = SpendbackCardsModule.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            ))
  }
}
