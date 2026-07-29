import { useEffect, useState } from 'react';
import type { ViewTransform } from '../../app/projectTypes';
import {
  listUnderlayImages,
  UNDERLAYS_CHANGED_EVENT,
  type UnderlayImage,
} from '../../persistence/underlayStore';
import { worldToScreen } from '../../app/transform';

type UnderlayWithUrl = UnderlayImage & { url: string };

export function UnderlayLayer({
  projectId,
  view,
}: {
  projectId: string;
  view: ViewTransform;
}) {
  const [images, setImages] = useState<UnderlayWithUrl[]>([]);

  useEffect(() => {
    let cancelled = false;
    let loadVersion = 0;
    let objectUrls: string[] = [];
    const revoke = (urls: readonly string[]) => {
      if (
        typeof URL === 'undefined' ||
        typeof URL.revokeObjectURL !== 'function'
      ) return;
      for (const url of urls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Object URL cleanup is best-effort during browser teardown.
        }
      }
    };
    const load = async () => {
      const version = ++loadVersion;
      let createdUrls: string[] = [];
      try {
        const stored = await listUnderlayImages(projectId);
        if (cancelled || version !== loadVersion) return;
        if (stored.length === 0 && objectUrls.length === 0) return;
        if (
          typeof URL === 'undefined' ||
          typeof URL.createObjectURL !== 'function'
        ) {
          throw new Error('Object URLs are unavailable');
        }
        createdUrls = stored.map((image) => URL.createObjectURL(image.blob));
        if (cancelled || version !== loadVersion) {
          revoke(createdUrls);
          return;
        }
        const previousUrls = objectUrls;
        objectUrls = createdUrls;
        createdUrls = [];
        setImages(stored.map((image, index) => ({
          ...image,
          url: objectUrls[index],
        })));
        revoke(previousUrls);
      } catch {
        revoke(createdUrls);
        if (!cancelled && version === loadVersion) {
          const hadImages = objectUrls.length > 0;
          revoke(objectUrls);
          objectUrls = [];
          if (hadImages) setImages([]);
        }
      }
    };
    const onChanged = (event: Event) => {
      const changedProject = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!changedProject || changedProject === projectId) void load();
    };
    setImages([]);
    void load();
    window.addEventListener(UNDERLAYS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      loadVersion += 1;
      window.removeEventListener(UNDERLAYS_CHANGED_EVENT, onChanged);
      revoke(objectUrls);
      objectUrls = [];
    };
  }, [projectId]);

  return (
    <g aria-label="underlay images" pointerEvents="none">
      {images.filter((image) => image.visible).map((image) => {
        const origin = worldToScreen({ x: image.x, y: image.y }, view);
        const width = image.width * image.scale * view.scale;
        const height = image.height * image.scale * view.scale;
        return (
          <image
            key={image.id}
            href={image.url}
            x={origin.x}
            y={origin.y - height}
            width={width}
            height={height}
            opacity={image.opacity}
            transform={`rotate(${-image.rotationDeg} ${origin.x} ${origin.y})`}
            preserveAspectRatio="none"
          />
        );
      })}
    </g>
  );
}
