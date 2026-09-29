import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-storage.js";

const storageInstances = new WeakMap();
const emulatorConnected = new WeakSet();

export function getAdvanceStorage(app) {
  if (storageInstances.has(app)) return storageInstances.get(app);

  const storage = getStorage(app);
  const hostname = window.location.hostname;
  const useEmulator = hostname === 'localhost' || hostname === '127.0.0.1';

  if (useEmulator && !emulatorConnected.has(storage)) {
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    emulatorConnected.add(storage);
    console.info('[Advance Check] Storage conectado ao emulador local :9199');
  }

  storageInstances.set(app, storage);
  return storage;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem.'));
    };
    img.src = url;
  });
}

export async function compressReportImage(file, options = {}) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('O arquivo selecionado não é uma imagem.');
  }

  const maxDimension = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.70;
  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Falha ao comprimir a imagem.')),
      'image/webp',
      quality
    );
  });

  const baseName = (file.name || 'foto').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return new File([blob], `${baseName}.webp`, {
    type: 'image/webp',
    lastModified: Date.now()
  });
}

export async function uploadReportImage({ app, relatorioId, file, onProgress }) {
  if (!relatorioId) throw new Error('relatorioId é obrigatório para o upload.');

  const compressed = await compressReportImage(file);
  const storage = getAdvanceStorage(app);
  const uniqueName = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.webp`;
  const path = `relatorios/${relatorioId}/${uniqueName}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, compressed, {
    contentType: 'image/webp',
    cacheControl: 'public,max-age=86400'
  });

  await new Promise((resolve, reject) => {
    task.on('state_changed', snapshot => {
      if (typeof onProgress === 'function') {
        onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      }
    }, reject, resolve);
  });

  return {
    nome: compressed.name,
    path,
    url: await getDownloadURL(task.snapshot.ref),
    tamanhoOriginal: file.size,
    tamanho: compressed.size,
    mimeType: compressed.type,
    larguraMaxima: 1600,
    qualidade: 0.70
  };
}

export async function getReportImageUrl({ app, path }) {
  if (!path) throw new Error('Caminho da imagem não informado.');
  return getDownloadURL(ref(getAdvanceStorage(app), path));
}

export function isStorageEmulatorActive() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export async function deleteReportImage({ app, path }) {
  if (!path) return;
  await deleteObject(ref(getAdvanceStorage(app), path));
}
