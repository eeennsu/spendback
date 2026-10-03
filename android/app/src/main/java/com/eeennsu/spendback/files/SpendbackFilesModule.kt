package com.eeennsu.spendback.files

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.StatFs
import androidx.core.content.FileProvider
import com.eeennsu.spendback.specs.NativeSpendbackFilesSpec
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import okhttp3.Call
import okhttp3.Request

/**
 * 모델 파일 내려받기(PRD 4.7)와 백업 파일 주고받기(PRD 4.8). JS 스펙은 src/native/NativeSpendbackFiles.ts다.
 * 경로는 모두 앱 내부 저장소(filesDir, cacheDir) 안이다.
 */
class SpendbackFilesModule(reactContext: ReactApplicationContext) :
    NativeSpendbackFilesSpec(reactContext), ActivityEventListener {

  private val executor = Executors.newCachedThreadPool()
  private val calls = ConcurrentHashMap<String, Call>()
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  private var pickPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = NAME

  override fun getFilesDir(): String = reactApplicationContext.filesDir.absolutePath

  override fun getCacheDir(): String = reactApplicationContext.cacheDir.absolutePath

  override fun getFreeBytes(): Double =
      StatFs(reactApplicationContext.filesDir.absolutePath).availableBytes.toDouble()

  override fun fileSize(path: String): Double {
    val file = File(path)
    return if (file.isFile) file.length().toDouble() else -1.0
  }

  override fun deleteFile(path: String): Boolean {
    File("$path.part").delete()
    return File(path).delete()
  }

  override fun download(
      id: String,
      url: String,
      path: String,
      sha256: String,
      size: Double,
      promise: Promise,
  ) {
    cancelled.remove(id)
    executor.execute {
      try {
        downloadBlocking(id, url, File(path), sha256, size.toLong())
        promise.resolve(null)
      } catch (e: DownloadError) {
        promise.reject(e.code, e.message, e)
      } catch (e: IOException) {
        if (cancelled.contains(id)) promise.reject("cancelled", "내려받기를 취소했어요", e)
        else promise.reject("network", e.message ?: "network", e)
      } finally {
        calls.remove(id)
      }
    }
  }

  private class DownloadError(val code: String, message: String) : Exception(message)

  /**
   * 받는 중에는 .part에 쓰고, .part가 있으면 Range로 이어받는다. 받으면서 SHA-256을 계산하므로 1GB 넘는 파일을
   * 다시 읽어 해시하지 않는다. 이어받을 때만 이미 받은 부분을 먼저 해시에 넣는다
   */
  private fun downloadBlocking(id: String, url: String, target: File, sha256: String, size: Long) {
    target.parentFile?.mkdirs()
    val part = File(target.path + ".part")
    var received = if (part.isFile) part.length() else 0L
    if (received > size) {
      part.delete()
      received = 0L
    }
    // 남은 만큼과 여유 64MB가 없으면 시작하지 않는다
    if (getFreeBytes() < (size - received) + 64L * 1024 * 1024) {
      throw DownloadError("no-space", "저장 공간이 모자라요")
    }

    val digest = MessageDigest.getInstance("SHA-256")
    if (received > 0) part.inputStream().use { input -> feed(input, digest) }

    val request =
        Request.Builder()
            .url(url)
            .apply { if (received > 0) header("Range", "bytes=$received-") }
            .build()
    val call = OkHttpClientProvider.getOkHttpClient().newCall(request)
    calls[id] = call
    if (cancelled.contains(id)) call.cancel()

    call.execute().use { response ->
      val append =
          when {
            response.code == 206 -> true
            response.code == 416 && received == size -> true
            response.isSuccessful -> {
              // 서버가 Range를 무시하면 처음부터 받는다
              received = 0L
              digest.reset()
              false
            }
            else -> throw IOException("HTTP ${response.code}")
          }
      if (response.code != 416) {
        val body = response.body ?: throw IOException("빈 응답")
        FileOutputStream(part, append).use { output ->
          val buffer = ByteArray(256 * 1024)
          var lastEmit = 0L
          body.byteStream().use { input ->
            while (true) {
              val read = input.read(buffer)
              if (read < 0) break
              output.write(buffer, 0, read)
              digest.update(buffer, 0, read)
              received += read
              val now = System.currentTimeMillis()
              if (now - lastEmit > 250) {
                lastEmit = now
                emitProgress(id, received, size)
              }
            }
          }
        }
      }
    }
    emitProgress(id, received, size)

    val actual = digest.digest().joinToString("") { "%02x".format(it) }
    if (!actual.equals(sha256, ignoreCase = true)) {
      part.delete()
      throw DownloadError("hash-mismatch", "파일이 손상됐어요")
    }
    target.delete()
    if (!part.renameTo(target)) throw IOException("파일을 옮기지 못했어요")
  }

  private fun feed(input: java.io.InputStream, digest: MessageDigest) {
    val buffer = ByteArray(1024 * 1024)
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      digest.update(buffer, 0, read)
    }
  }

  private fun emitProgress(id: String, received: Long, total: Long) {
    val event = Arguments.createMap()
    event.putString("id", id)
    event.putDouble("received", received.toDouble())
    event.putDouble("total", total.toDouble())
    emitOnDownloadProgress(event)
  }

  override fun cancelDownload(id: String) {
    cancelled.add(id)
    calls[id]?.cancel()
  }

  override fun writeTextFile(path: String, content: String, promise: Promise) {
    executor.execute {
      try {
        val file = File(path)
        file.parentFile?.mkdirs()
        file.writeText(content)
        promise.resolve(null)
      } catch (e: IOException) {
        promise.reject("io", e.message, e)
      }
    }
  }

  override fun readTextFile(path: String, promise: Promise) {
    executor.execute {
      try {
        promise.resolve(File(path).readText())
      } catch (e: IOException) {
        promise.reject("io", e.message, e)
      }
    }
  }

  override fun shareFile(path: String, mimeType: String, title: String, promise: Promise) {
    try {
      val context = reactApplicationContext
      val uri: Uri =
          FileProvider.getUriForFile(context, "${context.packageName}.files", File(path))
      val send =
          Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
      val chooser = Intent.createChooser(send, title)
      val activity = context.currentActivity
      if (activity != null) activity.startActivity(chooser)
      else context.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("share", e.message, e)
    }
  }

  override fun pickTextFile(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("no-activity", "앱이 화면에 없어요")
      return
    }
    pickPromise?.resolve(null)
    pickPromise = promise
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          // 공유 앱마다 JSON을 다른 형식으로 저장한다(application/json, text/plain, octet-stream)
          type = "*/*"
        }
    activity.startActivityForResult(intent, PICK_REQUEST)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != PICK_REQUEST) return
    val promise = pickPromise ?: return
    pickPromise = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.resolve(null)
      return
    }
    executor.execute {
      try {
        val text =
            reactApplicationContext.contentResolver.openInputStream(uri)?.use {
              it.readBytes().toString(Charsets.UTF_8)
            }
        promise.resolve(text)
      } catch (e: Exception) {
        promise.reject("io", e.message, e)
      }
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  override fun invalidate() {
    calls.values.forEach { it.cancel() }
    executor.shutdownNow()
    reactApplicationContext.removeActivityEventListener(this)
    super.invalidate()
  }

  companion object {
    const val NAME = NativeSpendbackFilesSpec.NAME
    private const val PICK_REQUEST = 4251
  }
}
