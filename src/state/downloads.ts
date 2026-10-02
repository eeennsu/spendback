import { create } from 'zustand';

import { type DownloadFailure, Files, failureOf, modelPath } from '../native/files';
import { type Model, modelUrl } from '../retro/models';

/**
 * 모델 내려받기 상태(PRD 4.7). 받는 일은 네이티브 스레드가 하므로 화면을 나가도 이어진다. 진행률은 네이티브 이벤트로
 * 오고, 이 저장소가 모델마다 들고 있다
 */
type Download =
  | { status: 'downloading'; received: number; total: number }
  | { status: 'failed'; failure: DownloadFailure };

type DownloadState = {
  downloads: Record<string, Download | undefined>;
  start: (model: Model) => Promise<void>;
  cancel: (model: Model) => void;
};

let subscribed = false;

export const useDownloads = create<DownloadState>((set, get) => ({
  downloads: {},
  start: async model => {
    if (!subscribed) {
      subscribed = true;
      Files.onDownloadProgress(({ id, received, total }) => {
        const current = get().downloads[id];
        if (current?.status !== 'downloading') return;
        set(state => ({
          downloads: { ...state.downloads, [id]: { status: 'downloading', received, total } },
        }));
      });
    }
    set(state => ({
      downloads: {
        ...state.downloads,
        [model.id]: { status: 'downloading', received: 0, total: model.sizeBytes },
      },
    }));
    try {
      await Files.download(
        model.id,
        modelUrl(model),
        modelPath(model),
        model.sha256,
        model.sizeBytes,
      );
      set(state => ({ downloads: { ...state.downloads, [model.id]: undefined } }));
    } catch (error) {
      set(state => ({
        downloads: {
          ...state.downloads,
          [model.id]: { status: 'failed', failure: failureOf(error) },
        },
      }));
    }
  },
  cancel: model => Files.cancelDownload(model.id),
}));
