import { useEffect, useRef, useState } from 'react';
import AtmPhotoGuideOverlay from './AtmPhotoGuideOverlay';

export default function CameraCaptureModal({ photoType, onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e) {
        setError(e.message || 'Не удалось открыть камеру');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `atm-${photoType}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      onCapture(file);
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="camera-capture-overlay" role="dialog" aria-modal="true">
      <div className="camera-capture-shell">
        <button type="button" className="camera-capture-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
        {error ? (
          <div className="camera-capture-error">
            <p>{error}</p>
            <button type="button" className="btn-secondary" onClick={onClose}>Закрыть</button>
          </div>
        ) : (
          <>
            <div className="camera-capture-viewport">
              <video ref={videoRef} className="camera-capture-video" playsInline muted />
              <div className="camera-capture-guide-layer">
                <AtmPhotoGuideOverlay photoType={photoType} />
              </div>
            </div>
            <div className="camera-capture-actions">
              <button
                type="button"
                className="btn-primary camera-capture-btn"
                onClick={handleCapture}
                disabled={!ready}
              >
                📷 Сделать снимок
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
