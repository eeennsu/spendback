package com.eeennsu.spendback.cards

import android.content.Context
import java.io.File
import java.util.UUID
import org.json.JSONException
import org.json.JSONObject

/**
 * 카드 알림 대기열 파일과 지켜보는 앱 목록(PRD 4.9). 서비스와 모듈이 같은 프로세스에서 함께 쓴다. 대기열은 앱 내부
 * 저장소의 JSON Lines 파일이고, JS가 DB에 넣은 뒤 ack로 지운다. 앱이 꺼져 있어도 서비스가 적을 수 있게 파일로 둔다.
 */
object CardInbox {
  private const val FILE = "card-inbox.jsonl"
  private const val PREFS = "cards"
  private const val APPS = "apps"

  private fun file(context: Context) = File(context.filesDir, FILE)

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun watchedApps(context: Context): Set<String> =
      prefs(context).getStringSet(APPS, null) ?: emptySet()

  fun setWatchedApps(context: Context, apps: Collection<String>) {
    prefs(context).edit().putStringSet(APPS, apps.toSet()).apply()
  }

  @Synchronized
  fun append(context: Context, app: String, title: String, text: String, postedAt: Long) {
    val line =
        JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("app", app)
            .put("title", title)
            .put("text", text)
            .put("postedAt", postedAt)
    file(context).appendText(line.toString() + "\n")
  }

  /** 받은 순서. 깨진 줄(쓰다 끊긴 줄)은 건너뛴다 */
  @Synchronized
  fun read(context: Context): List<JSONObject> {
    val file = file(context)
    if (!file.isFile) return emptyList()
    return file.readLines().mapNotNull { line ->
      try {
        if (line.isBlank()) null else JSONObject(line)
      } catch (e: JSONException) {
        null
      }
    }
  }

  @Synchronized
  fun ack(context: Context, ids: Set<String>) {
    val rest = read(context).filter { it.optString("id") !in ids }
    val file = file(context)
    if (rest.isEmpty()) file.delete()
    else file.writeText(rest.joinToString("") { it.toString() + "\n" })
  }
}
