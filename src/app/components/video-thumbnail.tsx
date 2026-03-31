import { useEffect, useState } from 'react'

type VideoThumbnailProps = {
  className: string
  src: string
  fallbackSrc: string
}

export function VideoThumbnail({ className, src, fallbackSrc }: VideoThumbnailProps) {
  const [hasError, setHasError] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)

  useEffect(() => {
    setHasError(false)
    setPreviewReady(false)
  }, [src])

  if (hasError) {
    return <img className={className} src={fallbackSrc} alt="" draggable={false} />
  }

  return (
    <video
      className={className}
      src={src}
      muted
      playsInline
      preload="metadata"
      draggable={false}
      style={previewReady ? undefined : { opacity: 0 }}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          setPreviewReady(true)
          return
        }

        const targetTime = Math.min(0.12, Math.max(video.duration * 0.05, 0.01))
        if (Math.abs(video.currentTime - targetTime) < 0.01) {
          setPreviewReady(true)
          return
        }

        try {
          video.currentTime = targetTime
        } catch {
          setPreviewReady(true)
        }
      }}
      onLoadedData={() => {
        if (!previewReady) {
          setPreviewReady(true)
        }
      }}
      onSeeked={() => setPreviewReady(true)}
      onError={() => {
        setHasError(true)
        setPreviewReady(false)
      }}
    />
  )
}
