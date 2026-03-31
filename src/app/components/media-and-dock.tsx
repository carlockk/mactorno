import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useSpring, useTransform, type MotionValue } from 'motion/react'
import { renderDockIconContent } from '../helpers'
import type { DockIconSpec, ResolvedPerformanceProfile } from '../types'

export const DockIconButton = memo(function DockIconButton({
  id,
  name,
  accent,
  icon,
  isOpen,
  mouseX,
  centerX,
  onActivate,
  registerRef,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onContextMenu,
  motionProfile = 'high',
}: {
  id: string
  name: string
  accent: string
  icon: DockIconSpec
  isOpen: boolean
  mouseX: MotionValue<number>
  centerX: number
  onActivate: () => void
  registerRef: (id: string, node: HTMLButtonElement | null) => void
  draggable?: boolean
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
  motionProfile?: ResolvedPerformanceProfile
}) {
  const [hovered, setHovered] = useState(false)
  const dockRange = motionProfile === 'compatibility' ? 120 : motionProfile === 'balanced' ? 150 : 180
  const minWidth = 50
  const maxWidth = motionProfile === 'compatibility' ? 58 : motionProfile === 'balanced' ? 68 : 82
  const maxLift = motionProfile === 'compatibility' ? -5 : motionProfile === 'balanced' ? -10 : -18

  const distance = useTransform(mouseX, (value) => value - centerX)

  const itemWidth = useSpring(useTransform(distance, [-dockRange, 0, dockRange], [minWidth, maxWidth, minWidth]), {
    mass: 0.12,
    stiffness: 180,
    damping: 14,
  })
  const iconScale = useSpring(useTransform(distance, [-dockRange, 0, dockRange], [1, maxWidth / 48, 1]), {
    mass: 0.12,
    stiffness: 180,
    damping: 14,
  })
  const iconLift = useSpring(useTransform(distance, [-dockRange, 0, dockRange], [0, maxLift, 0]), {
    mass: 0.12,
    stiffness: 180,
    damping: 14,
  })
  const tooltipLift = useTransform(iconLift, (value) => value - 8)

  return (
    <motion.button
      ref={(node) => {
        registerRef(id, node)
      }}
      type="button"
      className="dock-item"
      style={{ width: itemWidth, minWidth: itemWidth }}
      aria-label={`Abrir ${name}`}
      draggable={draggable}
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStartCapture={onDragStart}
      onDragOver={onDragOver}
      onDragEndCapture={onDragEnd}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
    >
      <AnimatePresence>
        {hovered ? (
          <motion.span
            className="dock-label visible"
            style={{ y: tooltipLift }}
            initial={{ opacity: 0, y: 8, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 4, x: '-50%' }}
          >
            {name}
          </motion.span>
        ) : null}
      </AnimatePresence>
      <motion.span
        className="dock-icon"
        style={{ background: accent, scale: iconScale, y: iconLift }}
      >
        {renderDockIconContent(icon)}
      </motion.span>
      <motion.span
        className={`dock-indicator${isOpen ? ' visible' : ''}`}
        style={{ y: useTransform(iconLift, (value) => value * 0.35) }}
      />
    </motion.button>
  )
})

export function VideoPlayer({
  src,
  videoRef,
  onPlaybackStateChange,
}: {
  src: string
  videoRef?: (node: HTMLVideoElement | null) => void
  onPlaybackStateChange?: () => void
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [aspectRatio, setAspectRatio] = useState(16 / 10)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    const updateSize = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      if (!width || !height) {
        return
      }

      const containerRatio = width / height
      if (containerRatio > aspectRatio) {
        const nextHeight = height
        const nextWidth = Math.round(nextHeight * aspectRatio)
        setFrameSize({ width: nextWidth, height: nextHeight })
        return
      }

      const nextWidth = width
      const nextHeight = Math.round(nextWidth / aspectRatio)
      setFrameSize({ width: nextWidth, height: nextHeight })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [aspectRatio, src])

  return (
    <div ref={stageRef} className="media-stage media-video-stage">
      <div className="media-video-frame" style={{ width: frameSize.width, height: frameSize.height }}>
        <video
          className="media-video"
          src={src}
          controls
          preload="auto"
          ref={videoRef}
          onPlay={onPlaybackStateChange}
          onPause={onPlaybackStateChange}
          onVolumeChange={onPlaybackStateChange}
          onRateChange={onPlaybackStateChange}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget
            if (video.videoWidth && video.videoHeight) {
              setAspectRatio(video.videoWidth / video.videoHeight)
            }
            onPlaybackStateChange?.()
          }}
        />
      </div>
    </div>
  )
}

export function PhotoViewer({ src, alt, zoom = 1, rotation = 0 }: { src: string; alt: string; zoom?: number; rotation?: number }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [aspectRatio, setAspectRatio] = useState(4 / 3)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    const updateSize = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      if (!width || !height) {
        return
      }

      const containerRatio = width / height
      if (containerRatio > aspectRatio) {
        const nextHeight = height
        const nextWidth = Math.round(nextHeight * aspectRatio)
        setFrameSize({ width: nextWidth, height: nextHeight })
        return
      }

      const nextWidth = width
      const nextHeight = Math.round(nextWidth / aspectRatio)
      setFrameSize({ width: nextWidth, height: nextHeight })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [aspectRatio, src])

  return (
    <div ref={stageRef} className="media-stage media-photo-stage">
      <div className="media-photo-frame" style={{ width: frameSize.width, height: frameSize.height }}>
        <img
          className="media-image"
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          onLoad={(event) => {
            const image = event.currentTarget
            if (image.naturalWidth && image.naturalHeight) {
              setAspectRatio(image.naturalWidth / image.naturalHeight)
            }
          }}
        />
      </div>
    </div>
  )
}
