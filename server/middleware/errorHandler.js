export function errorHandler(err, req, res, _next) {
  console.error('API error:', err?.message || err);

  if (res.headersSent) return;

  if (err?.code === 'LIMIT_FILE_SIZE') {
    const mb = process.env.PHOTO_UPLOAD_MAX_MB || '12';
    return res.status(400).json({ error: `Файл слишком большой (макс. ${mb} МБ до сжатия)` });
  }

  if (err?.message === 'Только изображения') {
    return res.status(400).json({ error: err.message });
  }

  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({
    error: err?.message || 'Внутренняя ошибка сервера',
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
