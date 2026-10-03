package com.eeennsu.spendback.cards

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * 카드 앱의 알림을 받는다(PRD 4.9). 지켜보는 앱(CardInbox.watchedApps)의 알림만 열고, 나머지는 내용을 읽지 않는다.
 * 파싱하지 않고 원문을 대기열에 적기만 한다. 읽기·짝짓기·추천은 JS(src/cards)가 앱이 앞으로 올 때 한다.
 */
class CardNotificationService : NotificationListenerService() {

  /** 끊긴 동안 온 알림 중 알림창에 남은 것을 줍는다. 같은 알림은 JS가 지문으로 거른다 */
  override fun onListenerConnected() {
    activeNotifications?.forEach(::capture)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) = capture(sbn)

  private fun capture(sbn: StatusBarNotification) {
    if (sbn.packageName !in CardInbox.watchedApps(this)) return
    val notification = sbn.notification
    // 묶음 요약 알림은 개별 알림과 내용이 겹친다
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    val extras = notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text =
        (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)
                ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n"))
            ?.toString()
            .orEmpty()
    if (title.isEmpty() && text.isEmpty()) return
    CardInbox.append(this, sbn.packageName, title, text, sbn.postTime)
    SpendbackCardsModule.notifyQueued(sbn.packageName)
  }
}
