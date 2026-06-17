/**
 * Сжимает фото в браузере до JPEG перед отправкой на сервер (снижает нагрузку на VPS).
 * @param {File} file
 * @param {{ maxEdge?: number, jpegQuality?: number }} [options]
 */
export async function compressImageForUpload(file, options = {}) {
  if (!file?.type?.startsWith('image/')) return file;

  const defaultMaxEdge = parseInt(
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PHOTO_MAX_EDGE
      ? import.meta.env.VITE_PHOTO_MAX_EDGE
      : '1280',
    10,
  );
  const maxEdge = options.maxEdge > 0 ? Math.round(options.maxEdge) : defaultMaxEdge;
  const jpegQuality = options.jpegQuality > 0
    ? Math.min(0.95, Math.max(0.5, options.jpegQuality / 100))
    : 0.82;

  try {
    let width;
    let height;
    let draw;

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      draw = (ctx, w, h) => {
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
      };
    } else {
      const img = await loadImageElement(file);
      width = img.naturalWidth;
      height = img.naturalHeight;
      draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h);
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    draw(ctx, w, h);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', jpegQuality);
    });
    if (!blob) return file;

    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('compressImageForUpload:', err);
    return file;
  }
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}
