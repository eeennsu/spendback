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
import java.util.concurrent.TimeUnit
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

  /** 같은 폴더 안의 rename이라 to가 있어도 한 번에 바뀐다(쓰다 잘린 파일이 남지 않는다) */
  override fun moveFile(from: String, to: String): Boolean {
    val target = File(to)
    target.parentFile?.mkdirs()
    return File(from).renameTo(target)
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
        when {
          cancelled.contains(id) -> promise.reject("cancelled", "내려받기를 취소했어요", e)
          // 쓰다가 공간이 바닥나도 IOException이다. 연결 탓으로 알리지 않는다
          getFreeBytes() < SPACE_MARGIN -> promise.reject("no-space", "저장 공간이 모자라요", e)
          else -> promise.reject("network", e.message ?: "network", e)
        }
      } finally {
        calls.remove(id)
        reserved.remove(id)
      }
    }
  }

  private class DownloadError(val code: String, message: String) : Exception(message)

  /** 받는 중인 모델마다 앞으로 쓸 바이트. 함께 받을 때 저장 공간 확인에 쓴다 */
  private val reserved = ConcurrentHashMap<String, Long>()

  /**
   * RN 공용 클라이언트는 시간 제한이 없어, 바이트가 더 오지 않는데 연결이 끊기지도 않으면 영원히 기다린다. 연결과
   * 읽기에만 제한을 둔다. 전체 시간(callTimeout)은 1.5GB 받기를 자르므로 두지 않는다
   */
  private val client by lazy {
    OkHttpClientProvider.getOkHttpClient()
        .newBuilder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
  }

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
    // 남은 만큼과 여유 64MB가 없으면 시작하지 않는다. 함께 받는 중인 모델이 쓸 만큼도 센다
    synchronized(reserved) {
      val others = reserved.filterKeys { it != id }.values.sum()
      if (getFreeBytes() < (size - received) + others + SPACE_MARGIN) {
        throw DownloadError("no-space", "저장 공간이 모자라요")
      }
      reserved[id] = size - received
    }

    val digest = MessageDigest.getInstance("SHA-256")
    if (received > 0) part.inputStream().use { input -> feed(input, digest) }

    val request =
        Request.Builder()
            .url(url)
            .apply { if (received > 0) header("Range", "bytes=$received-") }
            .build()
    val call = client.newCall(request)
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
            // 저장소가 사라졌거나(404) 서버 오류다. 연결 문제가 아니다
            else -> throw DownloadError("unavailable", "HTTP ${response.code}")
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
        val text = reactApplicationContext.contentResolver.openInputStream(uri)?.use { readLimited(it) }
        promise.resolve(text)
      } catch (e: TooLargeException) {
        promise.reject("too-large", "파일이 너무 커요", e)
      } catch (e: Throwable) {
        // OutOfMemoryError는 Exception이 아니다. 잡지 않으면 실행기 스레드에서 앱이 죽고 promise가 끝나지 않는다
        promise.reject("io", e.message, e)
      }
    }
  }

  /**
   * 선택기는 아무 파일이나 고를 수 있다(모든 형식). 영상이나 모델 파일을 통째로 읽으면 메모리가 모자라 앱이 죽으므로
   * MAX_PICK_BYTES까지만 읽고 넘으면 거부한다
   */
  private fun readLimited(input: java.io.InputStream): String {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      if (out.size() + read > MAX_PICK_BYTES) throw TooLargeException()
      out.write(buffer, 0, read)
    }
    return out.toString(Charsets.UTF_8.name())
  }

  private class TooLargeException : IOException()

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
    /** 받은 뒤에도 남겨 둘 여유 공간 */
    private const val SPACE_MARGIN = 64L * 1024 * 1024
    /** 백업은 기록 수만 건이어도 몇 MB다 */
    private const val MAX_PICK_BYTES = 32 * 1024 * 1024
  }
}
