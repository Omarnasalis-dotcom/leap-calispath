import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Same pattern mobile's InlineVideoPlayer uses to pull an 11-char video id
// out of any of YouTube's URL shapes (youtu.be/, /v/, /u/<x>/, /embed/,
// ?v=, &v=).
export function getYouTubeVideoId(url: string): string {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : '';
}

export function VideoModal({
  url,
  name,
  onClose,
}: {
  url: string;
  name?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;

  return (
    <dialog className="confirm video-modal" ref={ref} onClose={onClose}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, flexWrap: 'nowrap' }}>
        <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name || 'Exercise demo'}
        </h2>
        <button
          type="button"
          className="btn icon ghost"
          aria-label="Close video"
          onClick={() => ref.current?.close()}
        >
          <X />
        </button>
      </div>
      <div className="video-modal-frame">
        {/* youtube-nocookie.com: no third-party cookies until the viewer
            actually presses play — the only YouTube host allowed by this
            app's CSP frame-src. */}
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
          title={name || 'Exercise demo video'}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          frameBorder={0}
        />
      </div>
    </dialog>
  );
}
