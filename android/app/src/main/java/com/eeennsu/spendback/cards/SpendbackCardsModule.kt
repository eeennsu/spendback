package com.eeennsu.spendback.cards

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import com.eeennsu.spendback.specs.NativeSpendbackCardsSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import java.lang.ref.WeakReference

/**
 * 카드 알림 받기(PRD 4.9). JS 스펙은 src/native/NativeSpendbackCards.ts다. 알림 접근 권한과 대기열 파일을 JS에 잇는다.
 */
class SpendbackCardsModule(reactContext: ReactApplicationContext) :
    NativeSpendbackCardsSpec(reactContext) {

  init {
    instance = WeakReference(this)
  }

  override fun getName() = NAME

  override fun isListenerEnabled(): Boolean {
    val context = reactApplicationContext
    return NotificationManagerCompat.getEnabledListenerPackages(context)
        .contains(context.packageName)
  }

  override fun openListenerSettings() {
    val context = reactApplicationContext
    val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    component(context).flattenToString())
        else Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
    val activity = context.currentActivity
    if (activity != null) activity.startActivity(intent)
    else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  override fun setWatchedApps(apps: ReadableArray) {
    val context = reactApplicationContext
    CardInbox.setWatchedApps(context, (0 until apps.size()).mapNotNull { apps.getString(it) })
    // 절전 등으로 끊긴 리스너를 다시 잇는다(PRD 10장). 이어져 있으면 아무 일도 없다
    if (isListenerEnabled()) NotificationListenerService.requestRebind(component(context))
  }

  override fun readInbox(promise: Promise) {
    try {
      val list = Arguments.createArray()
      for (item in CardInbox.read(reactApplicationContext)) {
        val map = Arguments.createMap()
        map.putString("id", item.optString("id"))
        map.putString("app", item.optString("app"))
        map.putString("title", item.optString("title"))
        map.putString("text", item.optString("text"))
        map.putDouble("postedAt", item.optLong("postedAt").toDouble())
        list.pushMap(map)
      }
      promise.resolve(list)
    } catch (e: Exception) {
      promise.reject("io", e.message, e)
    }
  }

  override fun ackInbox(ids: ReadableArray, promise: Promise) {
    try {
      val set = (0 until ids.size()).mapNotNull { ids.getString(it) }.toSet()
      CardInbox.ack(reactApplicationContext, set)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("io", e.message, e)
    }
  }

  private fun emitQueued(app: String) {
    val event = Arguments.createMap()
    event.putString("app", app)
    emitOnQueued(event)
  }

  override fun invalidate() {
    instance = null
    super.invalidate()
  }

  companion object {
    const val NAME = NativeSpendbackCardsSpec.NAME

    /** 서비스가 새 알림을 적었을 때 앱이 떠 있으면 JS에 알린다 */
    @Volatile private var instance: WeakReference<SpendbackCardsModule>? = null

    fun notifyQueued(app: String) {
      instance?.get()?.emitQueued(app)
    }

    fun component(context: Context) = ComponentName(context, CardNotificationService::class.java)
  }
}
